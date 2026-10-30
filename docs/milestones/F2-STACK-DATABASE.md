# F2 — implementation stack and PostgreSQL foundation

Date: 30 October 2026. Status: complete for review.

## Delivered scope

- [Stack decision](../decisions/ADR-001-IMPLEMENTATION-STACK.md): Node.js 22+, strict TypeScript, Next.js/React web, Fastify API, PostgreSQL, `pg`, SQL migrations, Better Auth selected for F3.
- TypeScript API bootstrap with HTTP health, request IDs, sanitized errors and actual restricted-role DB probing. F1 and prototype commands remain separate.
- Two ordered migrations promoting the 28-table reviewed domain schema and tenant read-role baseline; roles, ownership and encrypted-secret references stay separate from auth credentials.
- Real local PostgreSQL development launcher, persistent ignored local data, generated credentials and separate owner/runtime URLs.
- Migration apply/status commands, repeatable tests and forward-fix policy. No automatic schema mutation at API startup.
- No new application UI, authentication implementation, paid provider generation, cloud provisioning or publishing integration.

## Acceptance and evidence

- [x] Record selected stack, alternatives and deferred work.
- [x] Strict backend typecheck and compiled build pass.
- [x] Actual PostgreSQL 17 starts locally, without Docker or a system installation.
- [x] Two migrations apply; a second apply performs no work.
- [x] 28 domain tables and migration history exist on the real server.
- [x] Runtime role is non-owner/non-superuser/non-bypass and denied DDL/identity/global-budget access.
- [x] Tenant reads isolate two workspaces on separate connections; context is cleared after commit/rollback.
- [x] Immutable versions and same-workspace references are enforced.
- [x] Deliberately failed migration leaves no partial table/history; subsequent clean migration is safe.
- [x] Health distinguishes connected DB from unsafe/missing/unavailable DB; overall readiness stays 503 because media storage is not implemented.
- [x] Existing F1 and prototype regression checks pass after dependency changes: all 23 tests passed, including real MP4 encode/decode.

`npm run test:f2`: seven tests passed: six real-PostgreSQL integration tests and one API error regression test. Malformed JSON, unsupported content types and oversized bodies retain HTTP 400/415/413; unexpected failures return a sanitized 500. [Database results](../db/f2-validation-results.json). The local development database was also initialized/migrated separately through the user-facing commands. `npm run check:f2` and `npm run build:api` passed. Source versions are pinned in `package.json`/`package-lock.json`; web and identity packages are installed in their own later milestones.

Read [database setup](../../packages/database/README.md) for commands and credential handling. No hosted backups, production roles/TLS, auth workflows, media-storage readiness, load tests or complete release security are claimed by this milestone.

## Next

F3: Better Auth integration, reviewed auth-schema migrations, secure session/cookie/CSRF handling, verification/recovery transport, and atomic one-private-workspace bootstrap. Implement it as the next reviewed feature; do not migrate the prototype's custom password logic into the production API.
