# F3 — identity and private workspace

Date: 30 October 2026. Status: complete for review.

## Scope delivered

- Better Auth 1.7.14 with private PostgreSQL auth schema, transaction-enabled credential operations and a separate restricted login.
- Atomic identity/workspace/dispatch/binding bootstrap through a protected database trigger.
- Email/password registration and sign-in, mandatory verification, server sessions, logout/revoke-all, change password and recovery/reset.
- Session-derived `/api/v1/me`, own-workspace GET and timezone PATCH with CSRF, Origin and If-Match checks.
- Sanitized auth adapter, host-independent request construction, safe forwarding/cookies, rate limiting and fail-closed production configuration.
- Local-only file mail transport plus configurable TLS SMTP transport; no real messages were sent during development/testing.
- Forward migrations, local setup command, backend contract handoff and integration checks. No product UI, social publishing, provider generation or cloud deployment.

## Local setup

```powershell
# Keep the local PostgreSQL launcher running in a separate terminal
npm run db:local

npm run db:migrate
npm run auth:setup
npm run dev:f3
```

If PostgreSQL is already running, do not launch another instance on its port. `auth:setup` generates local secrets and a restricted identity login, preserves existing nonempty configuration and writes only ignored local files. It registers no user. Never show `apps/api/.env` or `.local/postgres/config.json` in logs/chat.

Local verification/reset messages are JSON files under ignored `.local/auth-mailbox/`, readable by the developer from disk. They contain live one-hour links and must not be committed/shared or exposed over an API. This is not external inbox delivery. Production must supply HTTPS, the correct trusted origin, `AUTH_MAIL_MODE=smtp`, `SMTP_URL` and `AUTH_MAIL_FROM`; local transport is rejected in production. Use an `smtp://` or `smtps://` connection URL without paths, query options or fragments; query overrides could disable required TLS or certificate validation and are rejected. SMTP delivery/credentials remain a release setup and integration check.

## Acceptance

- [x] Reviewed library-generated SQL plus protected bootstrap/resolver/session-status trigger.
- [x] Strict typecheck and API build.
- [x] Registration requires verification and creates exactly one private workspace.
- [x] Duplicate/concurrent signup does not duplicate workspace; forced credential failure rolls back all related records.
- [x] Credentials and domain access use separate limited DB roles.
- [x] Protected requests resolve identity/workspace from server session, not caller ownership fields.
- [x] Origin, session-bound CSRF, timezone validation and stale-edit behavior.
- [x] Logout/revoke-all/password reset invalidate server sessions; cache is disabled.
- [x] Recovery avoids account enumeration; invalid/weak/reused reset requests do not bypass validation.
- [x] Database-backed throttling and sanitized errors/headers.
- [x] Final expanded suite: password-change revocation, expired reset token, tampered verification, explicit session refresh and missing production configuration.
- [x] Regression record and tracker updated; compiled API smoke check recorded below.

## Evidence and limits

Tests run against actual PostgreSQL and Fastify/Better Auth requests with in-memory email interception and one local-file sink check. All **13 F3 tests**, **7 F2 tests**, and **23 F1/prototype tests** passed (43 total). Backend strict typecheck/build passed. The migration replay applies zero new work after the four recorded migrations. F2's failed-migration fixture now uses a unique directory and asserts the deliberately missing SQL relation, so stale fixture files cannot produce a false-positive rollback test.

Verification commands: `npm run check:f3`, `npm run test:f3`, `npm run test:f2`, `npm test`, `npm run build:api`, `npm run db:migrate`. Tests cover a real DB transaction failure, concurrent signup, private workspace separation, CSRF/Origin checks, cookie flags, expiry/reset reuse, mandatory other-session revocation, read-only GET vs explicit POST session refresh, auth-role privilege separation and raw-error logging suppression.

Compiled-server smoke passed using the actual local runtime/identity logins: F3 liveness, both DB checks connected, and anonymous `/api/v1/me` rejected with 401. The temporary API process was stopped afterward. Runtime dependency audit reported zero known vulnerabilities at verification time. Ignored local environment, credential and mail directories were checked against Git ignore rules.

Account disable is exercised through controlled test DB updates, not an operator UI endpoint. Password hashing, credentials, signed links and session semantics belong to Better Auth; no custom password/token scheme was added. The CSRF HMAC is application-specific and bound to the server session ID. We do not claim external SMTP delivery, browser UI, production role/TLS deployment, proxy settings, load capacity, backup restore or full-release security from this backend milestone.

See [identity boundary ADR](../decisions/ADR-002-IDENTITY-WORKSPACE.md), [HTTP handoff](../api/IDENTITY-F3.md), and [recorded results](../db/f3-validation-results.json).

Next: **F4 — implement the approved homepage, shared application shell and auth forms**, connected to these real session/workspace endpoints. Keep later generation/publishing features out of that milestone.

## Independent QA — 30 October 2026

Passed within the backend milestone scope; no blocking defect found in the exercised cases. Independently reran strict backend typechecking, the API build, all F2 tests and all F1/prototype tests. Extended the F3 suite from 13 to 15 tests and reran it successfully: **45 tests passed overall** (15 F3, 7 F2, 23 F1/prototype).

Additional adversarial checks reject cross-session CSRF replay for workspace edits and session revocation, reject injected workspace ownership/revision fields without changing saved state, preserve the trusted origin in verification mail despite hostile Host/proxy headers, and enforce sign-in rate limits despite rotating caller-supplied forwarding/IP headers. Existing integration tests also passed for verification, atomic bootstrap/rollback, duplicate signup, recovery expiry/reuse, password-change/reset revocation, tenant isolation and database-role separation.

Confirmed local environment, mailbox, PostgreSQL configuration and compiled output paths are ignored by Git. No external mail or paid provider calls were made. External SMTP delivery, browser forms, deployed TLS/proxy behavior and broader production security remain outside this QA pass.

## Commit review verification

Final review: 46 tests passed (16 F3, 7 F2, 23 F1/prototype), plus strict typecheck, API build and syntax checks. Rejected SMTP URL options that could override required TLS/certificate validation, with regression coverage. F3 database tests now use a unique cluster directory per run to avoid stale cluster state. No external mail was sent.
