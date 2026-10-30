# ADR 001 — implementation stack

Date: 30 October 2026. Status: selected for F2 onward. Scope: implementation choices within the reviewed modular architecture.

## Decision

Use Node.js 22+, strict TypeScript, a Next.js App Router/React web app, a Fastify API, PostgreSQL 17-compatible SQL, `pg` for explicit database access, and `node-pg-migrate` for ordered SQL migrations. Select Better Auth with PostgreSQL for F3 authentication. Keep content/render/publishing workers independently runnable in the same repository. Use npm and one root lockfile initially; separate package publishing/workspace build tooling is unnecessary for the current team.

F2 installs and verifies the API/database/tooling dependencies. Next.js/React are introduced when implementing the web shell in F4; Better Auth is installed/configured in F3. Their versions and security advisories must be checked again at installation. Authentication tables live in a separate `auth` schema; `newbert.app_users` remains an issuer/subject mapping, not a password table. Generate and review auth migrations in F3 rather than allowing runtime schema changes.

Keep the first production API and workers in TypeScript. The F1 `.mjs` health server and root prototype remain runnable historical references, not mixed into the new Fastify routes. Build backend TypeScript into `dist/`; frontend uses Next's own compiler later. Domain contracts stay in `docs/api/openapi-v1.json`; generate/validate client types when those features start, without maintaining a competing hand-written API schema.

## Reasons and alternatives

- React/Next fits the approved component-based pages and responsive forms. Fastify keeps the `/api/v1` boundary explicit and independently deployable; long work stays in workers, not web handlers. Express would also work, but is not selected.
- PostgreSQL matches linked versions, usage reservations, schedules and atomic jobs. MongoDB/SQLite are not the production database choice.
- Explicit SQL preserves the reviewed constraints, RLS and queue operations without introducing an ORM migration model alongside the SQL reference. Reconsider a query builder only if later feature complexity justifies it.
- Better Auth supplies established identity/session/recovery behavior and PostgreSQL integration. No new custom password implementation; no required paid identity subscription. Email delivery configuration and atomic identity/workspace integration remain F3 work.
- Use same-origin browser requests: Next forwards `/api` and auth traffic to Fastify via an internal deployment route/proxy. No wildcard credentialed CORS. Server sessions, CSRF and OAuth boundary checks are implemented in F3/F13, not inferred from framework selection.

## Local database

This machine currently has no Docker or PostgreSQL installation. Use pinned `embedded-postgres` development tooling to run actual PostgreSQL 17 binaries on loopback, with persistent ignored data and randomly generated local credentials. The npm wrapper carries a beta version label; it is development/test tooling only, not a production hosting component. Its PostgreSQL version is recorded by real-server verification. Do not create an OS user, system service or global installation.

Normal hosted PostgreSQL can replace this local launcher through separate migration/runtime URLs. Migration credentials never become API runtime credentials. Hosted role provisioning and TLS/region/backup settings remain deployment work.

## Consequences and boundaries

F2 creates versioned schema, least-privilege runtime baseline, a transaction-local workspace context helper, and truthfully measured database health. Readiness remains incomplete while media storage and later dependencies are absent. No authentication, product UI, paid provider requests, live publishing or cloud deployment is delivered in F2.

Migrations are forward-only after sharing. Do not edit an applied migration, auto-drop production tables or run destructive down migrations. Test rollback means verifying that a failed transactional migration leaves no partial schema/history. Repair deployed mistakes with a reviewed additive forward migration, or a separately authorized restore procedure.

Official references checked: [Next installation](https://nextjs.org/docs/app/getting-started/installation), [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Better Auth PostgreSQL](https://better-auth.com/docs/adapters/postgresql), [pg transactions](https://node-postgres.com/features/transactions), [node-pg-migrate](https://salsita.github.io/node-pg-migrate/api), [local PostgreSQL tooling](https://github.com/leinelissen/embedded-postgres). Installed lockfile and local package declarations are authoritative for actual installed versions; current web documentation can describe a newer migration-tool release.
