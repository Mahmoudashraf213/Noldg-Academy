# WhatsApp password recovery

This implements recovery for active students, teachers, and admins. Super-admin recovery is deliberately excluded. The destination is the phone already stored on the account; neither endpoint accepts a replacement phone or a role.

## Deployment

Before starting this version, apply the additive security migration and generate Prisma Client:

```sh
npm ci --ignore-scripts
npx prisma migrate deploy
npm run db:generate
```

Restart the application after changing environment configuration. The migration was validated in an isolated PostgreSQL schema; it was not applied to the application's original schema by this change. The new rate limits, SSE leases, notification outbox, media cleanup outbox, and recovery endpoints require its tables.

## Configuration after subscribing

Add these values to the existing `config/.env` or the deployment's environment configuration:

```dotenv
WHATSAPP_ENABLED=false
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=
WHATSAPP_RESET_TEMPLATE=
WHATSAPP_TEMPLATE_LANGUAGE=en_US
WHATSAPP_DEFAULT_COUNTRY_CODE=20
PASSWORD_RESET_SECRET=
```

Keep `WHATSAPP_ENABLED=false` until the integration is ready. Set it to `true` only after configuring a supported Graph API version, sender phone-number ID, access token with messaging permission, and an approved authentication template with a copy-code button. The template language must match its approved language. The code is supplied to both its body and its button.

Generate `PASSWORD_RESET_SECRET` independently from the JWT secret using a cryptographically random value of at least 32 bytes. For example, use Node's `crypto.randomBytes(32).toString("hex")` and store its output privately. Do not paste secrets into a collection, commit, API response, or support conversation. Changing this secret invalidates pending challenges; it does not rotate the existing JWT secret.

The integration uses Meta's Cloud API directly and adds no WhatsApp SDK. See the [Meta authentication-template example](https://www.postman.com/meta/whatsapp-business-platform/request/6vkv46u/create-authentication-template-w-otp-copy-code-button) and [Meta template component reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/component_object/). The Graph version is configuration rather than a hardcoded lifecycle assumption. Live delivery and template approval remain unverified until the subscription is configured.

## Postman / frontend flow

Request a code, without a token:

```http
POST http://localhost:3000/api/auth/forgot-password
Content-Type: application/json
```

```json
{
  "email": "student@example.com"
}
```

While WhatsApp is disabled or required configuration is missing, the response is HTTP 503:

```json
{
  "message": "WhatsApp password recovery is not available yet",
  "success": false
}
```

Once configured, the endpoint returns HTTP 200 with the same generic response for eligible, unknown, suspended, unsupported-role, invalid-destination, and cooldown cases:

```json
{
  "message": "If the account is eligible, a recovery code will be sent to its registered WhatsApp number",
  "success": true
}
```

This response acknowledges the request; it is not a delivery receipt. Eligible deliveries are processed asynchronously, normally picked up within five seconds when the worker is running. A temporary provider failure is retried up to three times before the code expires. The endpoint does not expose the code, phone, challenge ID, delivery status, or existence of an account. Provider response time does not delay the request response. Request limits still return HTTP 429 when exceeded.

Submit the received code and a new password:

```http
POST http://localhost:3000/api/auth/reset-password
Content-Type: application/json
```

```json
{
  "email": "student@example.com",
  "code": "123456",
  "password": "NewPassword123!"
}
```

The code above is an example, never a development bypass. A successful request returns HTTP 200 with `Password reset successfully; log in again`. An invalid, expired, undelivered, exhausted, replayed, or mismatched code returns HTTP 400 with `Invalid or expired recovery code`. The endpoint never returns a login token.

## Security rules

- Codes contain six digits, come from `crypto.randomInt`, expire five minutes after issuance, and permit at most five incorrect verification attempts.
- Database time controls issuance, cooldown, and verification expiry. Resending is subject to a sixty-second cooldown and replaces the previous challenge.
- Only an HMAC of the code is used for verification. A separate AES-256-GCM encrypted copy exists temporarily for asynchronous delivery and is cleared after successful sending. The decryption key is derived from `PASSWORD_RESET_SECRET`, which is not stored in the database.
- Provider credentials, codes, and provider response bodies are not logged or returned. There is no plaintext/dev mode, fake-success delivery, or bypass code.
- Requests and successful consumption lock the account row. Concurrent consumption can change the password only once. Incorrect attempts commit their counter update even though the response is an error.
- The challenge is bound to the account's phone and session version. Changing the phone or logging in invalidates the old challenge at verification; it cannot reset a different account.
- Success hashes the new password, increments `sessionVersion`, clears the active device/session, marks devices inactive, closes playback sessions, and deletes the challenge in the same transaction. Existing tokens, including nonexpiring tokens, fail subsequent session checks. The normal token lifetime setting is otherwise unchanged.
- Numbers are normalized to international digits. A leading `+` or `00` is supported. Local numbers starting with `0` use `WHATSAPP_DEFAULT_COUNTRY_CODE` (default `20`); an unparseable stored number receives no delivery. Verify existing account numbers before enabling the service.
- Expired challenges are removed by periodic security cleanup. If the provider stays unavailable, the API does not grant a reset.

## Request limits

Counters are stored in PostgreSQL and shared between instances. Limits use fixed windows:

| Scope | Limit |
| --- | --- |
| All `/api` requests | 1000 per IP per minute |
| Login | 30 per IP and 10 per submitted account identifier per 15 minutes |
| Student or teacher signup | 5 per IP per hour, separately per route |
| Forgot password | 10 per IP and 5 per email per 15 minutes |
| Reset password | 20 per IP and 10 per email per 15 minutes |
| Lesson uploads / teacher image updates | 20 per authenticated account per 15 minutes, separately |

The response includes `Retry-After` on rate-limit rejection. No request-supplied forwarding header is trusted by this change. If deployed behind a reverse proxy, configure trusted hops/subnets from the actual deployment topology; do not set `trust proxy=true` indiscriminately. Shared NAT users may share the IP-level quota. Database outages fail these protections closed rather than bypassing their checks.

## Tests

`npm test` runs the local tests. `TEST_DATABASE_URL` enables the PostgreSQL integration suite; use a direct, unpooled connection and run `npm run test:integration`. The suite creates a randomly named `noldg_security_test_*` schema, runs migrations there, and drops only that schema in its final cleanup. It does not use application tables in `public`. Meta requests and Cloudinary operations in tests are mocked; no customer phone receives messages.

All local tests and the integration suite passed during implementation. This verifies application logic and PostgreSQL transactions, not live Meta approval, actual delivery, WhatsApp account eligibility, or production gateway configuration.
