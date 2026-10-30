# PostgreSQL and migrations

F2 uses PostgreSQL 17-compatible SQL, the `pg` client and `node-pg-migrate`. Domain schema lives in `newbert`; migration history is `public.pgmigrations`. Better Auth will own a separate `auth` schema in F3. Migrations create no application users, sample projects, API keys or remote services.

## Start locally

From the repository root, with Node.js 22+ and `npm install` completed:

```powershell
# Terminal 1 — keep running
npm run db:local

# Terminal 2
npm run db:migrate
npm run db:status
npm run dev:f2
```

The local database listens on **127.0.0.1:54329**, uses the `newbert_dev` database, and persists under ignored `.local/postgres/data/`. The launcher generates random owner/runtime passwords into `.local/postgres/config.json`, and fills a missing/empty runtime URL in ignored `apps/api/.env`. Existing nonempty API database configuration is preserved. Do not copy these credentials into docs, logs or source control. Stop the database launcher with Ctrl+C; data is retained. This package's native launcher is local development tooling, not a production service manager.

`LOCAL_PG_PORT` can select another local port before first use. If you change a local cluster port later, update the runtime URL in `apps/api/.env` to match; the launcher will not overwrite an existing configured URL. Use different directories/ports for concurrently running local clusters. Test tooling uses its own ignored cluster directory and randomly named disposable database.

`db:migrate` uses the local owner URL from ignored config by default. For an existing **local** PostgreSQL service, explicitly configure `MIGRATION_DATABASE_URL` for migration commands and a separate `RUNTIME_DATABASE_URL` for the API. The provided CLI rejects remote hosts in F2. Hosted migration routing/TLS/grants require a separate reviewed deployment step; never weaken TLS verification for convenience.

## Roles

- `newbert_owner`: local development migration/bootstrap role; never pass its URL to the web/API runtime.
- `newbert_runtime`: NOLOGIN, no owner/superuser/RLS-bypass/role-management privileges. Baseline tenant SELECT rights only; identity mappings, global budgets, OAuth state and outbox are excluded.
- `newbert_app`: local restricted login, inherits `newbert_runtime` after migration. Production user passwords are provisioned separately from SQL migrations.

RLS uses `app.workspace_id` set transaction-locally on a checked-out connection. `withWorkspace` must receive the workspace resolved by the trusted identity boundary in F3; its argument is not authentication. No application business route exists in F2, and no browser can set this context through a public endpoint. Later features grant only their required write operations. Background/identity/OAuth service roles are not faked by giving the API owner access.

## Migration policy

Two initial migrations promote the reviewed domain reference and add the runtime-role baseline. Keeping table definitions for later features does not implement those features. The initial schema intentionally has no auth-provider credential tables.

Each ordered SQL file contains `-- Up Migration` and `-- Down Migration`. Shared/applied migrations are immutable: create another increasing timestamp-prefixed file for changes. `node-pg-migrate` history/order checks and advisory locking are enabled. Pending migrations run in a single transaction. No migration runs during normal API startup. The reviewed reference in `docs/db/schema-v1.sql` remains historical; future schema evolution belongs in these migration files, not automatic regeneration from that document.

No destructive down/reset script is supplied. The down sections explicitly fail. Rollback verification means failed DDL and history changes roll back together, not dropping production user data. For a deployed mistake, review an additive forward fix and compatibility plan; back up before irreversible changes, and use a separately approved restore if recovery requires one. Migrations needing nontransactional operations (for example concurrent index creation) require a separate documented plan rather than disabling transactions globally.

## Verification

```powershell
npm run check:f2
npm run build:api
npm run test:f2
```

F2 tests launch actual native PostgreSQL on a separate ephemeral loopback port, create a random `newbert_f2_*` database, run migration/role/tenant-isolation/rollback checks, drop only that test database, and stop the test cluster. The cluster's ignored directory remains for reuse; there is no recursive filesystem cleanup or reset of `newbert_dev`. [Recorded results](../../docs/db/f2-validation-results.json).

Migration files are reviewed code. History/order checks are not a content-checksum drift detector; source-control review and never editing applied SQL remain required. Concurrent writer admission, worker fencing, provider failures, usage/publishing races and restore drills are later acceptance cases, not implied by these F2 checks.
