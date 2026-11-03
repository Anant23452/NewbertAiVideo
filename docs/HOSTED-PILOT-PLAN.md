# Free hosted pilot and preservation plan

Updated: 3 November 2026. **Approved database/media migration completed and verified. Email setup and free Render deployment remain in progress.**

## Confirmed choices

- Free pilot; sleeping services and queued rendering are acceptable.
- Preserve existing local accounts, password hashes, projects and registered media. Do not start with an empty replacement database.
- Use Anant's Render workspace, `tea-db4ag5btqb8s73el5qjg`; leave the existing `Newbert2.0` service unchanged.
- Keep the Vercel frontend and private Supabase storage. Use Supabase PostgreSQL for application data after compatibility and restore checks.

## Proposed free compute arrangement

`Dockerfile` packages the API and worker, FFmpeg, Noto Devanagari fonts and font configuration. `scripts/hosting/pilot.mjs` starts both processes, forwards shutdown and stops the other process if either fails. The proposed `render.yaml` creates **one free web service**, not a paid background worker. The blueprint is JSON syntax, which is valid YAML, and passed Render's current public JSON Schema validation. Render CLI/platform validation and an actual Linux container build are still required; Docker is not installed in this local environment.

The public port comes from Render's `PORT`, and production binds to `0.0.0.0`. Render checks `/health/live`; `/health/ready` separately checks database, identity, private media and worker heartbeat. A long-running render must not cause instance replacement just because its queue heartbeat check is temporarily stale. Before allowing pilot generation, set database processing limits for one concurrent job and measure memory/CPU with real Hindi/Hinglish renders on the selected free instance.

Render sleeps inactive free web services; suspended jobs resume through the existing durable queue recovery policy. No scheduled publishing or always-on rendering guarantee. Free hours are shared with the workspace's existing free service; monitor the combined allowance. No paid resources or upgrades are authorized by this plan.

## Database compatibility change — code ready, real migration not applied

Migration `1793664000015_private-identity-schema.sql` moves Newbert's own `auth` schema to `newbert_auth`, preserving tables and refreshing qualified function bodies. It refuses to rename a schema containing Supabase's `auth.users`. After backup restore verification, this migration was applied to the actual local source. Updated API code now matches that source. Applied historical migrations remain unchanged.

Tests verify existing password hashes, session tokens and workspace identities survive; new identity creation still works; a managed-auth sentinel is protected. The actual source now has a verified backup and an export containing 41 tables and 345 rows. Hosted copying has not occurred.

## Cutover sequence

1. Connect the Supabase integration to inspect the intended project, or save its admin session-pooler connection in ignored `.local/hosted.env`. Credentials must not appear in chat, source control or logs. The integration is suggested but not yet confirmed connected.
2. Confirm the target application's schemas are absent and inspect TLS, server version and role-provisioning capability. `npm run hosting:check` provides a read-only preflight when a direct connection is saved; it pins the intended project and verifies certificates even when the input URL says `sslmode=require`.
3. Obtain PostgreSQL client tools compatible with the source (17+). No `pg_dump`/`pg_restore` or Docker executable was found locally. Prepare a private full source backup and verify a local restore before changing the source schema. Do not invent a partial JSON export as a backup substitute.
4. Stop source API/worker writes, check running/uncertain jobs and capture a consistent backup. Apply the reviewed namespace migration locally. Retain the original backup and local media.
5. Run `npm run hosting:media` to verify registered objects without uploads. Then use `npm run hosting:media -- --apply` to copy missing registered local objects to the private bucket, verifying size and SHA-256 after each upload. It never deletes source files or modifies database records; provider failures are not treated as missing objects.
6. Export **only** application schemas `newbert` and `newbert_auth`, plus a separately reviewed migration-history table. Do not restore or replace Supabase's managed `auth`, `storage`, roles or unrelated `public` objects. Restore to an empty application target with the necessary NOLOGIN roles, preserving grants/RLS and rebuilding dependencies through standard PostgreSQL dump/restore. Do not run the original local bootstrap migrations into Supabase's managed `auth` schema.
7. Provision separate restricted runtime, identity and worker logins; confirm role safety, tenant isolation and all schema/data counts. Preserve Better Auth's existing secret if session continuity is intended. Handle any Instagram token-encryption key separately if real connections exist.
8. Configure transactional email and server-only runtime secrets, then build/deploy the free container. Render free services block common SMTP ports 25/465/587: use a verified compatible transport or implement/test an HTTP email adapter. Do not disable verification or expose local mailbox links to make registration appear to work.
9. Verify readiness, fresh registration/verification, existing-account login, saved project/media access, generated storyboard → voice → MP4, process restart, unknown-provider outcome handling, and memory/cost limits.
10. Set Vercel's `API_INTERNAL_ORIGIN` to the verified HTTPS backend origin and configure the backend's `AUTH_BASE_URL`/`APP_ORIGIN` to the selected frontend origin. Redeploy and test sessions, private ranged playback and generation through the frontend. Keep the source preserved until explicit acceptance.

## Current blockers

- Browser automation cannot reliably capture Firefox. No Supabase dashboard settings were changed.
- Supabase integration is connected and the healthy intended project is confirmed. The direct admin URL remains empty, but integration access allows schema work without the original database password.
- Automatic approval rejected the exact live schema change and the 15-object private upload. User approval is required for the [concrete migration review](HOSTED-MIGRATION-REVIEW.md) before retrying.
- PostgreSQL tools and verified source backup/restore/export are complete. Linux container-build verification is still pending.
- Email delivery configuration is absent. The current app requires email verification for new accounts.

## Verification recorded in this preparation

- Backend build passed.
- 16 identity/configuration tests and 15 processing tests passed.
- 7 storage-adapter tests and 2 hosted TLS/project-guard tests passed.
- Namespace preservation/managed-schema refusal and cloud port-binding tests passed (2 cases).
- Render public-schema validation passed. No CLI/platform validation, Linux container run or hosted acceptance is claimed.

References: [Render free limits](https://render.com/docs/free), [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Supabase migration guide](https://supabase.com/kb/guides/migrate-from-postgres), [Project tracker](PROJECT-STATUS.md).

## Latest verified execution

The user approved the migration. All 41 tables/345 rows match the export; all 15 media objects were copied and verified. Seven restricted-role TLS/isolation checks passed, and security advisors are clear after pinning two private function search paths. Brevo HTTPS mail delivery has three passing adapter tests; sender/key setup is pending. No paid resources or new Render service created yet. See [evidence](deployment/hosted-migration-validation.json). Older preparation/approval blockers above are superseded.
