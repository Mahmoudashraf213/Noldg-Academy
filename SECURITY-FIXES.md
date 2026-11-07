# Security fixes and recovery implementation — 2026-11-07

This is the implementation follow-up to `SECURITY-REVIEW.md`. The review is a historical baseline, not the current list of unfixed code issues. The user authorized dependency upgrades, security fixes, and WhatsApp recovery. No production migration, JWT-key rotation, token-lifetime policy change, or live WhatsApp message was performed.

## Findings addressed

| Review finding | Implemented correction | Verification |
| --- | --- | --- |
| R01 / R02 | Patched dependency tree; Multer 2.5.0 and body-parser 2.4.0 installed. Compressed JSON disabled and body size explicit. | Final npm audit reports 0 vulnerabilities; parser HTTP tests. |
| R03 | Images capped at 5 MiB; lesson videos 256 MiB; each attachment 25 MiB; combined lesson files 500 MiB. Fields, parts, file counts, and upload rates bounded. | HTTP tests reject oversized images and attachments with 413. |
| R04 | Global temporary-file cleanup on response completion/close; idempotent local deletion; storage cleans failed streams; unsuccessful cloud/database changes compensate uploads. | HTTP fixture removed after validation failure; failed teacher transaction compensates image. |
| R05 | Shared PostgreSQL rate counters for API, login, signup, recovery, and uploads. | Real PostgreSQL concurrent requests cannot exceed a counter's allowance. |
| R06 | Active-super-admin count moved inside Serializable status transaction. Conflicting requests return a conflict instead of suspending everyone. | Two real concurrent transactions leave at least one active super admin. |
| R07 | Passwords limited to 72 UTF-8 bytes for creation, reset, and login; existing login is not subject to new password-complexity requirements. | ASCII/Unicode boundary tests. |
| R08 | Attachments re-read and merged in a Serializable transaction; unsuccessful concurrent writes conflict rather than overwrite a successful append. | PostgreSQL concurrent append/retry test preserves both attachments. |
| R09 | Retention detaches only the same video/version/time-window using a conditional update and enqueues deletion atomically. | Stale retention selection cannot clear a replaced video. |
| R10 | Media URL and returned expiry capped by lesson end as well as playback lease. | Actual controller tested against PostgreSQL with URL signing mocked. |
| R11 | Linked product names and teacher course synchronization now commit with their owning changes. Old media deletion is a retryable database task after detachment. Failed teacher creation compensates the new image. | Real rollback and linked-name tests; no post-commit product-name write remains. |
| R12 | Joi limits match varchar/integer bounds and validate real calendar dates. | Invalid dates, leap days, strings and Int bounds tested. |
| R13 | Known parser/upload errors preserve 400/413/415; P2003 becomes 409; known value/range errors become 400. | HTTP and centralized error mapping tests. |
| R14 | Course audiences persisted as transactional outbox jobs and processed by keyset cursor in 500-recipient transactions. Direct fanout reads recipients in bounded pages. SSE has shared database leases: 2 per user, 100 total, with 60-second expiry and renewal. | 1002-student fanout/cursor/idempotency and SSE lease lifecycle tests on PostgreSQL. |
| R15 | Closing failures are logged without blocking attempt processing; per-attempt failures do not abort subsequent attempts; keyset pages prevent a failed first page from starving later pages. | Failure-isolation test covers 51 records across two pages. |

## Recovery added

`POST /api/auth/forgot-password` and `POST /api/auth/reset-password` support active students, teachers, and admins with the registered WhatsApp number. Encrypted asynchronous delivery, HMAC verification, expiry, resend cooldown, bounded attempts, row locking, single-use consumption, and session revocation are implemented. Disabled/missing provider configuration returns 503. See `PASSWORD-RECOVERY.md` for bodies and the environment contract.

## Required before starting the updated app

Apply `prisma/migrations/20261107000000_security_password_recovery/migration.sql` through `npx prisma migrate deploy`, regenerate Prisma Client, and restart. The application's original schema was not migrated during implementation. All new background tasks run from `index.js`, so a continuously running application/worker is required. Serverless deployments that terminate timers need a scheduled/long-running worker; this change does not silently provision hosting infrastructure.

## Deliberate behavior changes and operational limits

- New passwords and login input above 72 UTF-8 bytes are rejected. A legacy account that used a longer password may need recovery or administrator-assisted remediation before WhatsApp is enabled. Password hashes cannot reveal whether an original password exceeded bcrypt's byte limit; no silent hash migration was attempted.
- IP-based quotas are shared across instances. Proxy trust/device identity still follows the existing implementation. The IP/User-Agent device fingerprint remains a policy limitation (review C02), not proof of a physical device. A different device contract needs a separate decision and frontend coordination.
- JWT expiry remains as configured, including `none`. The existing JWT secret was not rotated. Review C01's secret quality and C05's environment/infrastructure decisions remain for the deployment owner; no claim of complete infrastructure security is made.
- Course-student notifications are eventually delivered by an outbox worker, rather than inserting every student's row during publishing. Teacher/admin rows still commit with the business event. Failed student jobs retry with backoff and become `failed` after ten failures; inspect and requeue failed jobs deliberately after resolving their cause. Recipient eligibility is evaluated while processing each page, not as a full audience snapshot at publish time.
- Media cleanup is retried with backoff and becomes `failed` after ten failures. A database/cloud outage that also prevents compensating an uncommitted upload is logged for reconciliation; no distributed transaction with Cloudinary is claimed.
- Expired security counters, challenges, and stream leases are removed periodically. Completed outbox tasks are retained for 30 days; failed tasks are retained for investigation. The service must be monitored for failed jobs and backlog growth.
- SSE still polls each active stream. Shared caps bound this load but do not replace production capacity testing. Upload storage budgets and gateway request limits must match hosting capacity.
- API paths and token header were preserved; new recovery paths were added. Error statuses for previously misclassified failures intentionally changed. No changes to purchase amounts, grants, grades, or token lifetime were made.

## Dependency verification

`npm update --ignore-scripts` updated compatible versions, then Nodemailer/Puppeteer major versions were explicitly upgraded to patched versions after authorization. Minimum ranges for affected direct dependencies were raised to installed patched versions; `package-lock.json` records the full resolved tree. Both manifest and lock were updated together. Install scripts were not executed. Browser packages are not used by current API routes; any future browser automation deployment must install and test its required browser runtime separately.

Final versions include Axios 1.21.0, Joi 18.3.2, Mongoose 9.12.0, Multer 2.5.0, Nanoid 5.1.16, Nodemailer 10.3.1, Puppeteer/Puppeteer Core 25.16.0, body-parser 2.4.0 and proxy-addr 2.0.8. `SECURITY-AUDIT.after.json` preserves the final audit result (all counts zero). This is the registry's finding set at verification time, not a guarantee against unknown vulnerabilities.

## Checks performed

- `npm test`: 7 local tests passed; database suite intentionally skipped unless `TEST_DATABASE_URL` is supplied.
- PostgreSQL integration suite: 18 subtests passed (19 reported tests including their parent). It applied every migration in an isolated random schema and removed that schema afterward. It covered transactions, concurrency, rate limits, outbox delivery/idempotency, 1002 students, SSE leases, media expiry, image compensation, three recovery roles, replay, wrong attempts, expiry, cooldown, and provider failure.
- All 117 JavaScript files passed syntax checks; Prisma schema validation and client generation passed.
- The normal pooled application connection passed a read-only `SELECT 1` after keeping its original startup parameters. Custom `DATABASE_SCHEMA` is restricted to simple identifiers and uses an unpooled connection for integration tests.
- Final `npm audit --json`: zero findings. The earlier audit file remains as historical evidence.
- No production data, active application schema, real WhatsApp destination, or real Cloudinary asset was modified by integration tests. Provider behavior was mocked. No live subscription/template delivery verification was performed.

## Change report

The implementation follows the existing Express/Joi/Prisma modules, centralized messages, middleware, transactions, and background-worker patterns. Necessary extensions are PostgreSQL-backed rate limits, stream leases, and durable notification/media/delivery work. Those patterns did not previously exist in this form; they were introduced specifically to fix the approved concurrency/resource problems. The existing token header and normal authentication policy were preserved. No unrelated optional improvements were applied.

Detailed created/modified paths are listed below. The workspace has no Git repository; the final files and migration were inspected directly.

### Files created

| File | Change |
| --- | --- |
| `src/middleware/rate-limit.js` | Shared PostgreSQL fixed-window limits. |
| `src/middleware/upload-cleanup.js` | Temporary upload cleanup for rejected and completed requests. |
| `src/utils/media-cleanup.js` | Durable cleanup task queue and bounded-retry worker. |
| `src/utils/security-cleanup.js` | Expired security records and completed-job retention cleanup. |
| `src/utils/whatsapp.js` | Configured Meta authentication-template delivery and phone normalization. |
| `src/modules/auth/password-reset.controller.js` | Generic request and locked single-use verification/session revocation. |
| `src/modules/auth/password-reset.utils.js` | Encrypted delivery outbox and retry worker. |
| `prisma/migrations/20261107000000_security_password_recovery/migration.sql` | Five additive tables, indexes, and user foreign keys. |
| `tests/security.test.js` | Seven repeatable local security/HTTP tests. |
| `tests/security.integration.test.js` | Eighteen isolated PostgreSQL integration scenarios. |
| `PASSWORD-RECOVERY.md` | Configuration, requests, security rules and operator requirements. |
| `SECURITY-FIXES.md` | Finding-by-finding implementation and verification/change report. |
| `SECURITY-AUDIT.after.json` | Final registry audit evidence: zero advisories. |

### Files modified

| File | Change |
| --- | --- |
| `package.json` | Patched minimum dependency ranges, approved major upgrades and real test commands. |
| `package-lock.json` | Resolved patched dependency tree matching the manifest. |
| `prisma/schema.prisma` | Internal security, recovery, leases and work-queue models/relations. |
| `db/prisma.js` | Transaction acquisition/execution defaults and validated isolated-schema support; public pooled startup unchanged. |
| `src/bootStrap.js` | Bounded uncompressed JSON, upload cleanup, global request limits. |
| `src/middleware/asyncHandler.js` | Known database conflict/value error mapping. |
| `src/utils/generalFields.js` | Column bounds, real calendar dates, 72-byte password limit. |
| `src/utils/appError.js` | Known 400/413/415 errors, headers-sent guard. |
| `src/utils/multer-cloud.js` | Upload size/parts/fields caps and streaming lesson byte budgets. |
| `src/utils/file-functions.js` | Idempotent deletion of already-cleaned temporary files. |
| `src/utils/cloud.js` | Bounded timeout for public image cleanup. |
| `src/utils/constant/messages.js` | Recovery, rate limits, conflict and worker messages. |
| `src/modules/auth/auth.validation.js` | Recovery schemas and bounded login passwords. |
| `src/modules/auth/auth.router.js` | Recovery routes and account/IP limit middleware. |
| `src/modules/user/user.controller.js` | Last-super-admin invariant checked in Serializable transaction. |
| `src/modules/course/course.utils.js` | Course synchronization can participate in the owning transaction. |
| `src/modules/teacher/teacher.router.js` | Signup/image update limits before file processing. |
| `src/modules/teacher/teacher.controller.js` | Atomic course/profile writes, old image queue, new image compensation. |
| `src/modules/lesson/lesson.router.js` | Per-account upload request limits. |
| `src/modules/lesson/lesson.controller.js` | Serializable attachment merge, atomic product rename, detached-video queue. |
| `src/modules/lesson/lesson.utils.js` | Version/time/video conditional retention detach and upload compensation. |
| `src/modules/lesson/lesson-access.controller.js` | Signed and returned media expiry capped at lesson end. |
| `src/modules/attempt/attempt.utils.js` | Failure isolation and keyset iteration across cleanup pages. |
| `src/modules/notification/notification.utils.js` | Bounded recipient reads, durable course fanout and cursor/retry worker. |
| `src/modules/notification/notification.controller.js` | Shared stream leases, limits, renewal and close cleanup. |
| `index.js` | Start fanout, media, reset-delivery and security cleanup workers after DB startup. |
| `NOTIFICATIONS.md` | Current asynchronous delivery and SSE cap semantics; historical test distinction. |
| `SECURITY-REVIEW.md` | Mark original findings as a historical baseline and link the implementation report. |

Total: 13 created files and 28 modified files. Existing unrelated application modules and environment values were left unchanged.
