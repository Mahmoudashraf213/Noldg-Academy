# AGENTS.md — Project Coding Rules

These instructions apply to the entire repository unless a deeper `AGENTS.md` file overrides them.

## 1. Highest-Priority Rule: Follow the Existing Project

- Treat the existing codebase as the source of truth.
- Before creating or editing files, inspect the relevant existing files and identify the project's established structure, naming, formatting, imports, exports, comments, response format, error handling, validation, and middleware patterns.
- If the user provides reference files or explicitly identifies a reference implementation, follow those files as closely and literally as possible.
- Match the existing style consistently across every file and method. Do not replace it with your personal preferred style.
- Do not assume that a pattern listed in this document is already used in the repository. Verify it in the existing code first.
- If no matching pattern exists, ask the user which pattern to follow before introducing a new one.

## 2. Do Not Make Unapproved Changes

- Do not redesign the architecture, restructure folders, refactor unrelated code, rename existing identifiers, or change established patterns unless the user explicitly requests it.
- Do not add, remove, or upgrade dependencies or modify `package.json` / lock files without asking for approval first.
- Do not change database schemas, API contracts, response shapes, route paths, middleware order, authentication behavior, authorization rules, or business logic without approval.
- Do not delete files, overwrite substantial existing implementations, or perform broad automated edits without approval.
- Do not silently introduce optimizations, abstractions, design patterns, helper utilities, or new libraries.
- Preserve existing behavior unless the requested task explicitly requires changing it.
- If a requested implementation appears to require a change outside the established project pattern, stop and explain the proposed change before applying it.

## 3. Required Workflow Before Coding

1. Read the relevant files before making changes.
2. Locate similar implementations in the repository and use them as references.
3. Identify related models, controllers, routes, validators, middleware, utilities, and tests.
4. Briefly state the files you intend to change and the implementation approach.
5. If a necessary decision is unclear or conflicts with existing code, ask the user instead of guessing.
6. Make only the changes needed for the requested task.
7. Review the final diff and check that unrelated files were not changed.
8. Report exactly what was created, modified, or left unchanged.

For small, unambiguous changes, keep the explanation concise, but never skip inspecting the relevant code.

## 4. Backend Conventions

The repository's actual conventions always take priority. The following are known preferences when they match the project's existing implementation:

- Backend stack commonly uses Node.js, Express, MongoDB, and Mongoose.
- Use ES modules (`import` / `export`) when that is how the project is configured.
- Use Joi for validation when the project already uses Joi.
- Reuse existing utilities and middleware such as `AppError`, `asyncHandler`, `isAuthenticated`, `isAuthorized`, `roles`, `messages`, `generalFields`, and `isValid` when they exist.
- Follow the existing module structure and route registration pattern. Do not invent a new folder structure.
- Follow the project's existing Cloudinary upload and deletion helpers when image uploads are involved.
- Use the existing authentication header and token format. Do not change it.
- Follow the existing pagination, filtering, sorting, searching, and API response conventions.
- Keep business logic in the same layer used by comparable modules in this repository.

## 5. Controllers and Error Handling

- Match the exact controller pattern used by the closest existing controller.
- Do not add `try/catch` to controllers if the project uses `asyncHandler` and centralized error handling.
- When that is the established pattern, forward errors using the project's existing `AppError` and `next(...)` convention.
- Do not invent error messages or response structures. Reuse existing message helpers and conventions.
- Do not change status codes or success/error response formats without approval.

## 6. Models and Business Logic

- Match existing Mongoose schema conventions, including field names, types, defaults, required rules, indexes, references, and timestamps.
- Do not add schema hooks, virtuals, plugins, or middleware unless the user requests them or the existing project pattern requires them.
- Do not move calculations between the controller, service, model, or schema without approval.
- Preserve existing business rules and calculations. If a calculation seems incorrect, explain the issue and propose a correction before changing it.
- Check related models and references before changing relationships or delete behavior.

## 7. Validation, Routes, and Middleware

- Match the existing Joi schema structure and validation middleware usage.
- Match route naming, HTTP methods, ordering, and middleware placement from similar routes.
- Reuse existing authentication and authorization middleware.
- Do not weaken, bypass, or remove validation, authentication, authorization, or ownership checks.
- Do not add a new validation or middleware approach when the repository already has one.

## 8. Comments and Formatting

- Match the comment style, placement, density, and language of the reference files.
- When writing new code comments, write them in English.
- Do not add unnecessary comments or explain obvious code.
- Preserve existing formatting and naming conventions.
- Do not reformat unrelated code.
- Keep code consistent with the surrounding files rather than applying a repository-wide formatter.

## 9. Methods and Completeness

- Implement the methods required by the user's request and the module's actual business requirements.
- Common CRUD methods may include create, update, delete, get all, and get one, but do not add every method automatically.
- Add search, filtering, sorting, pagination, or other methods only when requested or when they are already part of the established module pattern.
- Do not create placeholder methods or speculative features.
- Check edge cases and related business rules before implementing a method.

## 10. Testing and Verification

- Use the repository's existing test and lint commands when available.
- Do not install tools or dependencies to run checks without approval.
- Do not claim that code was tested if it was not actually run.
- If a check cannot be run, state that clearly.
- For API work, provide example requests suitable for Postman when requested, following the project's real routes, headers, body format, and response structure.
- Never invent endpoint paths or request fields; verify them from the code.

## 11. Required Change Report

After completing a task, provide a concise report containing:

- Files created.
- Files modified.
- What changed in each file.
- Any deviation from the existing reference style.
- Any bug, ambiguity, or improvement noticed but not changed.
- Checks actually run and their results.

If you had to deviate from the established style, explicitly say what changed and why. Never hide a deviation.

## 12. Suggestions Must Be Separate

You may identify useful improvements, security concerns, bugs, or performance opportunities. However:

- Do not apply optional improvements automatically.
- Present each meaningful improvement separately as a suggestion.
- Explain its benefit and possible impact briefly.
- Wait for the user's approval before implementing it.

## 13. Communication

- The user may communicate in Arabic; respond in clear Egyptian Arabic unless asked otherwise.
- Keep source code, identifiers, API names, and code comments in English, consistent with the repository.
- Do not make assumptions when project files can answer the question.
- If the user says to copy a reference exactly, prioritize fidelity over stylistic preference or unnecessary modernization.

**Final rule:** Inspect first, imitate the repository, make only the requested changes, and disclose every deviation. Do not silently use your own coding style.
