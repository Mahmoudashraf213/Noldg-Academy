# Public platform settings

## Setup

```sh
npx prisma migrate deploy
npm run db:generate
```

Restart the server after deployment. Prisma Client was generated locally; this change did not apply the migration to Neon.

## Known keys

| Key | Type and validation | Default |
| --- | --- | --- |
| `platformName` | Nonempty trimmed string, at most 150 characters | `Noldg Academy` |
| `supportEmail` | Valid email, at most 320 characters, or empty string | `""` |
| `supportPhone` | Trimmed string, at most 64 characters, or empty string | `""` |
| `paymentInstructions` | Trimmed plain text, at most 5000 characters, or empty string | `""` |
| `socialLinks` | Object with only `facebook`, `instagram`, `youtube`, `tiktok`, `telegram`, `whatsapp` | `{}` |

Social links must be HTTP/HTTPS URLs of at most 2048 characters, or empty strings. Unknown keys at either level, null values, and empty PATCH bodies are rejected. Send an empty string to clear optional text/contact fields. Send `{ "socialLinks": {} }` to clear links. A supplied `socialLinks` object replaces the previous links object; omitted top-level settings remain unchanged.

## Endpoints

Public read, without token:

```http
GET http://localhost:3000/api/settings
```

The response is `{ message, success, data }`. `data` contains only the five public keys above, including defaults when the singleton has not been created yet. It does not expose commission, IDs, timestamps, environment variables, or secrets.

Update as a super admin, using the existing access token format:

```http
PATCH http://localhost:3000/api/settings
token: {{superAdminToken}}
Content-Type: application/json
```

```json
{
  "platformName": "Noldg Academy",
  "supportEmail": "support@example.com",
  "supportPhone": "01012345678",
  "paymentInstructions": "Contact support to confirm the payment details.",
  "socialLinks": {
    "youtube": "https://www.youtube.com/@example",
    "whatsapp": "https://wa.me/201012345678"
  }
}
```

Any subset of these top-level keys is accepted. A successful update returns HTTP 200 with the same public `data` shape. No token returns 401; an authenticated student, teacher, or admin returns 403; invalid keys or values return 400.

Changed settings create a `settings_updated` notification for active super admins, inside the update transaction. Its body lists changed request keys. Sending the same stored values does not notify again. Notification write failures propagate and prevent the transaction from committing.

These values are content for frontend display. They do not change registration, device limits, token lifetimes, payment amounts, payment approval behavior, or pricing. The existing commission APIs and singleton commission field remain the source of commission values. Updating public settings does not overwrite commission, and existing commission updates do not overwrite public settings. Environment configuration remains in `.env`.

## Change report

Created:

| File | Purpose |
| --- | --- |
| `src/modules/settings/settings.controller.js` | Public field selection, singleton read, partial update, and transactional notification |
| `src/modules/settings/settings.router.js` | Public GET and super-admin-only PATCH |
| `src/modules/settings/settings.validation.js` | Fixed settings and social-link allowlists with Joi validation |
| `prisma/migrations/20261106030000_public_settings/migration.sql` | Add five public fields to the existing singleton table without altering commission |
| `SETTINGS.md` | Keys, defaults, requests, deployment, and change report |

Modified:

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | Five fields and defaults in PlatformSettings |
| `src/modules/index.js` | Export settings router |
| `src/bootStrap.js` | Register `/api/settings` |
| `src/utils/constant/messages.js` | Shared settings messages |

No dependencies, package files, environment settings, existing routes, authorization rules, or business calculations were changed. The implementation follows the existing PlatformSettings singleton, module structure, Joi validation, middleware, response, and transaction patterns; no style deviation was required. No unrelated improvement was applied. This workspace has no Git repository, so the changed files were inspected directly.

Checks: Prisma schema validation and client generation; syntax/import checks; and an HTTP harness using mocked database delegates. The harness verified public defaults and field selection, all four role permissions, missing tokens, unknown keys, invalid emails/URLs, size limits, partial updates, optional-value clearing, link-object replacement, commission preservation, notifications, repeated-value suppression, and notification failure propagation. No database integration test or remote migration deployment was performed. `npm test` remains the existing placeholder.
