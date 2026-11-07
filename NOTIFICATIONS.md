# Notifications

## Setup

Apply the committed migration before starting this version of the application:

```sh
npx prisma migrate deploy
npm run db:generate
```

The implementation adds no dependencies. The existing order notification endpoints and tables remain available. Existing order notifications are not copied into the new inbox; the general inbox records events occurring after deployment.

## API

Every endpoint requires the existing `token` request header containing an access token. Each role can access only its own inbox; request parameters cannot select another user.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/notifications` | Paginated inbox, newest first |
| GET | `/api/notifications/stream` | SSE inbox snapshots |
| PATCH | `/api/notifications/:notificationId/read` | Mark an owned notification read; repeated requests preserve its original read time |
| PATCH | `/api/notifications/read-all` | Mark all currently unread notifications in the owner's inbox read |

List filters: `page` (default 1), `limit` (default 20, existing project maximum), `unread` (boolean), and `type` (event type). The response follows the existing `message`, `success`, `count`, `data`, and `pagination` convention and adds `unreadCount` for the entire inbox regardless of the selected filters. Identifiers use `_id`, as in the rest of the API.

Notification fields: `_id`, `userId`, `type`, `title`, `body`, `entityId`, `eventKey`, `readAt`, `createdAt`, and `updatedAt`. Resolve `entityId` using the notification's type; result notifications reference attempts, purchase notifications reference orders, and content notifications reference their lesson, assessment, or product. These references do not grant access to their targets.

## Events and recipients

| Types | Recipients |
| --- | --- |
| `account_created` | Student plus active admins/super admins; a new admin plus active super admins |
| `account_status_changed` | Affected account plus active admins/super admins |
| `teacher_application_submitted`, `teacher_application_approved`, `teacher_application_rejected` | Applicant plus active admins/super admins |
| `order_created`, `payment_submitted`, `order_approved`, `order_rejected` | Purchasing student, product's teacher, active admins/super admins |
| `access_granted` | Student receiving complimentary access, product's teacher, active admins/super admins |
| `lesson_published`, `lesson_updated`, `lesson_unpublished` | Eligible students, course teacher, active admins/super admins |
| `assessment_published`, `assessment_closed` | Eligible students, course teacher, active admins/super admins; closing includes the automatic cleanup path |
| `attempt_submitted` | Submitting student, assessment teacher, active admins/super admins; includes timeout and automatic submission |
| `attempt_graded` | Student, after automatic or completed manual grading; changed final scores generate an update |
| `product_created`, `product_updated` | Students holding relevant course access, course teacher, active admins/super admins |
| `teacher_payout` | Teacher, cash holder, active super admins |
| `teacher_commission_changed` | Teacher plus active admins/super admins |
| `platform_commission_changed` | Teachers using the platform default plus active super admins |

Paid lesson content targets active students owning that lesson or a package in its course. Exams target package owners only. Complimentary grants count as ownership. Free lessons and their assessments target all active students because the project has no free-course enrollment relationship. Announcing published content does not bypass its availability window or watch prerequisites when the student opens it.

Draft assessment edits, reads, autosaves, playback heartbeats, and partial manual grades do not create notifications. Live lesson creation remains disabled by the existing project; this change does not add live classes, reminder scheduling, email, or push delivery.

## Delivery

Direct notifications persist inside the business transaction. Course-student notifications instead enqueue a durable fanout job in that transaction; the worker processes keyset pages of 500 students and commits each page with its cursor. Delivery is eventual and retryable; an outage does not silently discard the event. A unique `(userId, eventKey)` constraint protects repeated recipients. Failed jobs retry with backoff and become `failed` after ten failures. See `SECURITY-FIXES.md` for operations and deployment requirements.

SSE emits an initial `notifications` event containing the newest 20 inbox rows, the total count, pagination, and `unreadCount`. It checks the database every three seconds and emits another snapshot when that payload changes; otherwise it emits a heartbeat comment. Each snapshot replaces the client's current first page; it is not a single-notification append event. Older rows remain available through the paginated list.

Shared database leases limit active streams to two per user and one hundred total. Leases expire after sixty seconds unless renewed; closing a stream releases its lease. Exceeding a cap returns HTTP 429 before opening the stream. General API rate limits also apply.

Reconnect by opening a new authenticated stream; it immediately returns the current snapshot. There is no `Last-Event-ID` replay protocol. The database inbox is the durable record, including events created while disconnected. Read actions are reflected in the next snapshot. Token expiry, logout, account suspension, and device/session revocation are rechecked each polling cycle and close the connection. Slow or disconnected clients are closed and their timers are removed. Transient polling failures close the stream, allowing the client to reconnect.

Use streaming `fetch` with `{ headers: { token } }` and an `AbortController`, and reconnect with backoff after an unexpected disconnect. Native browser `EventSource` does not provide this custom header. Tokens are never accepted in the URL. Proxy buffering must be disabled and the hosting platform must support long-lived responses. Multiple application instances read the same committed database state, so no Redis or process-local connection registry is required. Each active stream performs periodic authentication and inbox queries; measure database load before scaling concurrent connections.

## Verification

The paragraphs below describe the original notification implementation. Current security/concurrency verification, permanent tests and PostgreSQL integration results are documented in `SECURITY-FIXES.md`; `npm test` is now an actual test suite.

Schema validation and Prisma client generation were run locally. JavaScript syntax checks and an HTTP/runtime verification harness passed with mocked database delegates: fanout batches, duplicate keys, write failure propagation, recipient queries, validation, own-inbox access, read actions, `_id` serialization, initial SSE delivery, and disconnect after session revocation. No remote database migration or database integration test was run. The existing `npm test` script is a placeholder and was not used as a passing test suite.

A separate business integration harness also checked objective auto-grading, pending essay grading, repeated finalization, assessment publication, payment submission, purchase rejection, and propagation of notification failures out of the business transaction. These checks used mocked transactions, not an actual database rollback.

## Changed files

Created:

| File | Change |
| --- | --- |
| `src/modules/notification/notification.controller.js` | Own inbox, single/all read actions, authenticated SSE snapshots |
| `src/modules/notification/notification.router.js` | Four notification endpoints using existing middleware |
| `src/modules/notification/notification.validation.js` | Existing Joi pagination and identifier patterns |
| `src/modules/notification/notification.utils.js` | Transactional fanout, course audience selection, consistent inbox queries |
| `prisma/migrations/20261106010000_notifications/migration.sql` | Notification table, recipient/event uniqueness, inbox index, user foreign key |
| `NOTIFICATIONS.md` | Setup, event/recipient map, API, delivery semantics, verification and change report |

Modified:

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | Notification model and User relation |
| `db/index.js` | Notification delegate export |
| `src/bootStrap.js` | Register `/api/notifications` |
| `src/modules/index.js` | Export notification router |
| `src/utils/constant/messages.js` | Notification list/read/not-found messages |
| `src/modules/auth/auth.controller.js` | Student registration notifications in its transaction |
| `src/modules/user/user.controller.js` | Admin creation and account status notifications |
| `src/modules/teacher/teacher.controller.js` | Application submission, resubmission and decision notifications |
| `src/modules/order/order.controller.js` | New purchase notifications |
| `src/modules/payment/payment.controller.js` | Submitted payment notifications |
| `src/modules/order-approval/order-approval.controller.js` | Purchase approval/rejection notifications |
| `src/modules/entitlement/entitlement.controller.js` | Complimentary grant notifications |
| `src/modules/lesson/lesson.controller.js` | Published/updated/unpublished lesson notifications |
| `src/modules/assessment/assessment.controller.js` | Publication and manual closure notifications |
| `src/modules/attempt/attempt.utils.js` | Submission, objective result and automatic assessment closure notifications |
| `src/modules/grading/grading.controller.js` | Completed manual result and score-change notifications |
| `src/modules/product/product.controller.js` | Learning product and commission notifications |
| `src/modules/ledger/ledger.controller.js` | Teacher payout notifications |

Existing module structure, Joi validation, authentication header, response identifier conversion, and transaction conventions were followed. No dependencies, package files, existing route paths, or existing authorization rules were changed. Prisma Client was regenerated under `node_modules`. The workspace has no Git repository, so a Git diff was unavailable; the edited files and new schema SQL were inspected directly.
