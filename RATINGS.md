# Teacher ratings

## Setup

Apply the migration before starting the updated application:

```sh
npx prisma migrate deploy
npm run db:generate
```

The Prisma client was generated locally during implementation. The migration has not been applied to the remote database as part of this change.

## Rules

- Only authenticated students can save ratings.
- The teacher must have an approved profile and an active teacher account.
- The student must have an `approved` order whose `teacherId` matches the target teacher. An unpaid, pending, rejected, or another teacher's order does not qualify. Complimentary access alone does not qualify.
- Each student has one rating per teacher, enforced by a database unique constraint. Buying several products does not create additional votes.
- Stars are whole numbers from 1 to 5, validated by Joi and a database check constraint.
- An optional comment is trimmed and limited to 500 characters. Omit it on update to retain the previous comment; send `""` to clear it.
- Ratings and comments are public for approved active teachers. Public rows contain the student's name, without their contact information, account identifier, or session data.
- Average stars and count are calculated from all of the teacher's ratings, not only the requested page. An unrated teacher returns an average of 0 and count of 0.
- Saving a changed rating notifies the teacher and active admins/super admins in the same transaction. An identical repeat save does not update the row or notify again.

## Postman requests

Use the existing login endpoint and put the returned access token in the `token` header for saving a rating. No Bearer prefix is required.

Save or replace the authenticated student's stars:

```http
PUT http://localhost:3000/api/ratings/teachers/{{teacherId}}
token: {{studentToken}}
Content-Type: application/json
```

```json
{
  "stars": 5,
  "comment": "Clear explanations and helpful lessons."
}
```

This returns HTTP 200 for both the first save and subsequent edits, using `message`, `success`, and `data`. The saved row uses `_id` through the existing API serializer. The student's identity always comes from the token; the body cannot choose a student or teacher.

Public list and aggregate:

```http
GET http://localhost:3000/api/ratings/teachers/{{teacherId}}?page=1&limit=20
```

This returns `message`, `success`, `count`, `data`, `summary: { averageStars, totalRatings }`, and the existing pagination structure. `averageStars` is rounded to two decimal places. Pagination uses the project's existing limits (1 to 100 rows). Existing public teacher endpoints and their response shapes remain unchanged; clients request the ratings endpoint to display rating information.

Expected failures: 400 for invalid identifiers, stars, long comments, or unknown fields; 401 without a valid session; 403 for a non-student or a student without an approved purchase; 404 for a teacher who is missing, suspended, or unapproved.

## Change report

Created:

| File | Purpose |
| --- | --- |
| `src/modules/rating/rating.controller.js` | Purchase checks, own-rating save/update, public list/aggregate, and rating notifications |
| `src/modules/rating/rating.router.js` | Student-only PUT and public GET routes |
| `src/modules/rating/rating.validation.js` | Teacher ID, stars, comment, and pagination validation |
| `prisma/migrations/20261106020000_teacher_ratings/migration.sql` | Rating table, unique vote constraint, stars/self-rating checks, user foreign keys, and list index |
| `RATINGS.md` | Rules, setup, Postman examples, and change report |

Modified:

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | TeacherRating model and student/teacher User relations |
| `db/index.js` | TeacherRating delegate export |
| `src/modules/index.js` | Rating router export |
| `src/bootStrap.js` | Register `/api/ratings` |
| `src/utils/constant/messages.js` | Shared rating messages and purchase-required error |

The existing controller, transaction, Joi, authentication, authorization, notification, and response serialization conventions were followed. No dependencies, package files, existing routes, business calculations, or existing teacher response shapes were changed. No unrelated improvement was applied. No style deviation was required. The workspace is not a Git repository, so edited files were reviewed directly rather than through `git diff`.

Verification: Prisma schema validation, client generation, JavaScript syntax checks, and a real HTTP harness using mocked database transactions passed. The harness covered auth/role checks, invalid stars/comments/fields, own-student/target-teacher purchase filters, purchase rejection, create/update identity, comment preservation/removal, no-op saves, notification events, pagination, summary values, name-only public selection, `_id` serialization, and unavailable teachers. No remote database integration test or migration deployment was performed. The existing `npm test` remains a placeholder.
