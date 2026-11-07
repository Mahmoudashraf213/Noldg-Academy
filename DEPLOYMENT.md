# GitHub and Vercel deployment

## 1. Push the source to GitHub

Upload the project root containing `package.json`, `index.js`, `vercel.json`, `src/`, `db/`, and `prisma/`. Keep `package-lock.json`, all Prisma migrations, and `prisma.config.js` in the repository.

`.gitignore` excludes `config/`, environment secrets, `node_modules/`, generated output, Vercel metadata, logs, and local editor files. Commit `.env.example` as a template only. `.vercelignore` additionally excludes local files from CLI deployments.

From the project root, if you have not initialized Git yet:

```sh
git init
git add .
git status --short
git commit -m "Prepare API for Vercel"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Check the staged file list before committing. An ignore rule does not remove a secret already committed to Git; rotate any previously published credentials and remove them from history separately.

## 2. Import the repository into Vercel

1. Select **Add New > Project**, then import your GitHub repository.
2. Use the repository root as **Root Directory** and **Express** as the framework. Choose Node.js **22.x** in the project settings.
3. Leave the output directory unset. `vercel.json` runs `npm run db:generate` to generate the Prisma client on every build.
4. Before the first deployment, add the variables from `.env.example` under **Settings > Environment Variables**. Local `config/.env` is deliberately excluded.
5. Set `NEON_DATABASE_URL` to the pooled Neon PostgreSQL connection string. `NEON_DIRECT_URL` is the direct connection used for migrations.
6. Set strong, independent `SECRET_KEY`, `PASSWORD_RESET_SECRET` (at least 32 bytes), and `CRON_SECRET`. Set `CLIENT_ORIGIN` to the frontend's exact origin, and configure Cloudinary and email credentials.
7. Set `PUPPETEER_SKIP_DOWNLOAD=true` before installing dependencies. The current API does not use Puppeteer; this avoids downloading an unused browser without changing dependencies.
8. Configure the WhatsApp variables only when enabling WhatsApp password recovery. Enable `WHATSAPP_ENABLED=true` only after the template and credentials are ready.

Do not include local super-admin bootstrap credentials in Vercel. If needed, create the initial administrator using the existing `db/seedSuperAdmin.js` process locally, then disable bootstrap configuration.

Use a separate Neon database for Preview deployments. Do not point untrusted preview branches at the production database or share production secrets with them.

## 3. Apply existing migrations once before serving traffic

On a trusted machine with the intended database configured:

```sh
npx prisma migrate deploy
```

This applies the existing migration history. It is intentionally separate from the Vercel build so parallel or Preview deployments do not change production data. Do not use `prisma migrate dev` against production.

## 4. Run background jobs

Vercel runs the HTTP app without starting the six persistent timers. Choose one of the following before relying on notifications, automatic assessment submission, retention cleanup, or WhatsApp recovery delivery.

### Persistent worker (preserves the existing timing)

Run `node worker.js` on a persistent worker host with the same database, signing secrets, and provider settings. Generate Prisma before starting the worker with `npm run db:generate`. Restart the worker when source code or secrets change. This keeps the current 5-second, 15-second, 15-minute, and daily schedules.

Local `node index.js` still starts the HTTP server and existing timers. Do not run an additional local worker for that same instance.

### External scheduler

Alternatively, invoke the following routes over HTTPS using:

```http
Authorization: Bearer YOUR_CRON_SECRET
```

| GET route | Original cadence | Work per request |
| --- | --- | --- |
| `/api/jobs/recovery` | Every 5 seconds | One pending WhatsApp delivery |
| `/api/jobs/notifications` | Every 5 seconds | One audience page, up to 500 recipients |
| `/api/jobs/media` | Every 5 seconds | One detached asset deletion |
| `/api/jobs/attempts` | Every 15 seconds | Expired assessment attempts |
| `/api/jobs/security` | Every 15 minutes | Expired security records |
| `/api/jobs/video` | Daily | Expired lesson video retention |

Keep scheduler concurrency bounded and alert on job errors, failed outbox records, or growing queue backlogs. Existing outbox functions log provider errors and keep their existing retry behavior; HTTP 200 means the pass returned, not that every delivery succeeded. A worker is preferable for the original cadence and high-volume workloads. Large assessment backlogs can exceed the Vercel function duration and require the persistent worker.

No cron schedules are enabled automatically in `vercel.json`. Vercel Cron can call these GET routes using `CRON_SECRET`, but its available cadence depends on your plan; native cron schedules do not provide the original sub-minute timing. A slower scheduler delays deliveries and automatic submissions and processes fewer outbox records. In particular, do not schedule password recovery only once per day: recovery codes expire much sooner.

If Vercel Deployment Protection is enabled, the external scheduler must also use an authorized protection bypass; the job bearer secret alone does not bypass Vercel's protection.

## 5. Upload lesson media directly to Cloudinary

Vercel Functions accept request bodies up to 4.5 MB. The frontend must use the direct flow for lesson video and large attachments; the existing multipart endpoints remain available for local hosting and small requests. Other multipart routes are still subject to Vercel's combined 4.5 MB limit, including framing overhead.

### Request a signed upload

Use the existing teacher authentication header `token`, without changing its format:

```http
POST /api/lessons/courses/COURSE_ID/uploads/sign
token: TEACHER_ACCESS_TOKEN
Content-Type: application/json

{"kind":"video","name":"Lesson.mp4"}
```

For an attachment, use `{"kind":"attachment","name":"Notes.pdf"}`. The API requires an approved teacher who owns the course. The response uses the existing `{ message, success, data }` format. `data` contains `url`, `fields`, `uploadToken`, and `maxBytes`.

### Send the file to Cloudinary

Create a multipart `FormData`, append every entry from `data.fields` as a string and append the actual `File` as `file`. POST it directly to `data.url`. Let the browser set the multipart `Content-Type` and boundary. Do not send the teacher token to Cloudinary. Check that the Cloudinary request succeeded before saving the lesson. Files over Cloudinary's single-request upload limit must use its signed chunked upload flow with the same parameters; the Cloudinary plan must support the desired video size.

The backend signs a unique public ID with `overwrite=false` and `type=authenticated`. Keep the returned `uploadToken`; it expires after one hour. The Cloudinary API secret never goes to the frontend. Check `maxBytes` in the client before uploading; server verification enforces 256 MiB per video and 25 MiB per attachment after upload.

### Save the lesson using JSON

```http
POST /api/lessons/courses/COURSE_ID
token: TEACHER_ACCESS_TOKEN
Content-Type: application/json

{
  "title": "Lesson 1",
  "description": "Lesson content",
  "type": "recorded",
  "isFree": false,
  "availableFrom": "2026-12-01T10:00:00Z",
  "availableUntil": "2026-12-31T10:00:00Z",
  "videoUploadToken": "TOKEN_FROM_VIDEO_SIGNATURE",
  "attachmentUploadTokens": ["TOKEN_FROM_ATTACHMENT_SIGNATURE"]
}
```

Omit `attachmentUploadTokens` when there are no attachments. Use the same token fields with the existing `PATCH /api/lessons/LESSON_ID` endpoint to replace a video or append attachments. The API fetches trusted Cloudinary metadata, checks ticket scope, and prevents attaching an already used or deletion-queued asset. Do not supply Cloudinary URLs or public IDs in place of these tokens. Re-upload with a new ticket when a token expires. After a successful save, refresh the saved lesson after a network timeout before attempting to reuse its ticket.

Abandoned direct uploads (including files uploaded but never saved, and failed lesson saves) remain in Cloudinary. Their cleanup is not covered by the existing detached-media queue. Periodically reconcile old unreferenced assets in `noldg_academy/lessons/direct/` against the lesson records before deleting anything; never apply a blanket time-based deletion rule to that folder.

## 6. Verify the deployment

Run `npm test` and `npm run db:generate` locally before pushing. The database integration suite runs only with `TEST_DATABASE_URL`, which must point to a disposable test database.

After deployment, verify an existing endpoint such as `GET /api/settings`, teacher authentication, direct upload and lesson access, scheduler authorization (missing or incorrect secrets must return 401), job processing, and WhatsApp delivery. There is no new root health endpoint; a 404 at `/` does not itself mean the API failed.

References: [Express on Vercel](https://vercel.com/docs/frameworks/backend/express), [Function limits](https://vercel.com/docs/functions/limitations), [Cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cloudinary signed uploads](https://cloudinary.com/documentation/upload_images).

## Change report

| File | Status | Change |
| --- | --- | --- |
| `.gitignore` | Modified | Excludes secrets, local credentials, logs, editor files, and test output; keeps the environment template. |
| `index.js` | Modified | Exports Express, skips local listener and timers on Vercel, and fails initialization on database connection errors. |
| `src/bootStrap.js` | Modified | Registers the jobs router using the existing router aggregation pattern. |
| `src/modules/index.js` | Modified | Exports the jobs router. |
| `src/utils/constant/messages.js` | Modified | Adds standard messages for upload signatures and job passes. |
| `src/modules/lesson/lesson.controller.js` | Modified | Authorizes upload signing, accepts verified direct media, strips upload tokens before persistence, and checks single use. |
| `src/modules/lesson/lesson.router.js` | Modified | Adds the authenticated teacher upload-signing route. |
| `src/modules/lesson/lesson.validation.js` | Modified | Validates upload names, media kinds, and token fields. |
| `tests/security.integration.test.js` | Modified | Adds database-backed concurrent direct-upload claim checks, gated by `TEST_DATABASE_URL`. |
| `vercel.json` | Created | Express detection, Prisma generation, and function duration. |
| `.vercelignore` | Created | Excludes local-only files from CLI deployment. |
| `.env.example` | Created | Lists deployment variables without credentials. |
| `worker.js` | Created | Runs the existing background schedules on a persistent host. |
| `src/modules/jobs/jobs.controller.js` | Created | Runs existing job functions after validating the scheduler secret. |
| `src/modules/jobs/jobs.router.js` | Created | Exposes validated scheduler GET routes. |
| `src/modules/jobs/jobs.validation.js` | Created | Restricts task names to the six existing jobs. |
| `src/modules/lesson/lesson-upload.utils.js` | Created | Signs scoped uploads, verifies provider metadata, and guards asset reuse. |
| `tests/deployment.test.js` | Created | Checks upload scope, unsafe inputs, signatures, authorization, persistence, and Vercel initialization with mocked external services. |
| `DEPLOYMENT.md` | Created | Documents deployment, worker setup, frontend upload changes, checks, and limits. |

The approved deployment changes add direct JSON media fields, upload-signing and scheduler routes, and separate worker execution. They follow the existing modules, Joi, authentication, `asyncHandler`, `AppError`, and response conventions. `package.json`, `package-lock.json`, database schemas, migrations, and the existing job implementations were left unchanged. No files were deleted.

Local verification: `npm test` passed 14 tests with the database integration suite skipped because `TEST_DATABASE_URL` was not set; `npm run db:generate` succeeded. Git ignore rules were checked using a temporary Git repository: secrets and local files were excluded, while `.env.example`, `package-lock.json`, Prisma schema/migrations, `vercel.json`, and `worker.js` remained eligible for source control. Provider requests and database calls in the new unit tests are mocked; live Cloudinary uploads, a production build on Vercel, and database-backed concurrency still require deployment/test-environment verification. The project directory was not initialized as a Git repository, so a tracked Git diff was unavailable; the changed files were reviewed directly.
