# Supabase connection — preparation and remaining work

Updated: 1 November 2026. **Supabase private media storage connected; database, API and rendering remain local.**

## Credential verification

The user saved server-only configuration in ignored root `.env`. The actual configured bucket is `NewbertAiVideo`; the key was accepted without being displayed. The API and worker now use the shared Supabase storage adapter with `MEDIA_STORAGE_PROVIDER=supabase`.

Live verification uploaded a 231,408-byte synthetic MP4 through fenced artifact saving in an isolated test database. Full bytes matched, ranged playback returned HTTP 206, and anonymous/other-workspace access was rejected. One synthetic QA object remains in the private bucket; no AI calls or user-project changes. Restarted local services returned HTTP 200 API readiness. [Evidence](storage/supabase-validation.json).

## Storage behavior and operations

- New MP4, audio, VTT, composition and report artifacts use immutable workspace/artifact UUID keys in the private bucket. Uploads refuse a public bucket and never silently fall back to local writes.
- The existing 10 MiB per-object limit bounds upload/download; playback still uses Newbert authentication, short-lived access grants, size/hash verification and ranged responses. The secret remains backend-only.
- Missing cloud objects may read from the legacy local directory; authentication/server/network failures do not trigger this fallback. Old media has not been copied or deleted: retain `.local/private-media` until a separate migration is verified.
- API/worker environment values override root `.env`. Hosted processes need their own server settings. `MEDIA_STORAGE_PROVIDER=local` intentionally selects local storage and cannot read cloud-only objects.
- Run `npm run test:storage` for offline adapter tests. The opt-in `RUN_SUPABASE_SMOKE=true` script `tests/storage/live-smoke.ts` needs a synthetic `test-results/studio-render/video.mp4` and network/test-DB access. It retains a new private fixture; do not run it automatically at startup.
- Cloud retention/orphan cleanup, legacy-media migration, measured egress budgets and target-host restore/restart checks remain pilot gates. `media:audit` still audits only local disk. Consider resumable uploads for larger workloads.
- No hosted database migration or cloud API/rendering deployment occurred. Storage integration is independent of the database compatibility work below.

## Account and browser status

Browser automation could not reliably capture Firefox. The user supplied credentials through ignored local configuration; integration and verification used the storage API. No dashboard keys or settings were changed.

## Compatibility work before connection

- **Identity schema:** Newbert currently owns Better Auth tables in `auth`. Supabase uses `auth` for its managed authentication service. Inventory all qualified SQL, identity adapter settings, triggers, functions and grants before selecting a separate application identity schema. Preserve already-applied local migration history and test a reviewed hosted bootstrap path. Do not apply existing migrations unchanged into Supabase's managed schema.
- **Hosted migrations:** `scripts/db/cli.mjs` deliberately accepts only loopback databases. Add a separate explicit hosted migration path with verified TLS, target identification, migration status/preflight and least-privilege provisioning. Do not simply remove the local safety check.
- **Database roles:** Provision distinct restricted runtime, identity and worker logins; validate membership, grants, workspace isolation and connection limits on Supabase. Never run the API using migration-owner credentials.
- **Private media — implemented:** API and worker now share the configured `MediaStore` adapter, with bounded immutable writes and authenticated playback. Local storage remains supported; the configured bucket stays private.
- **Existing data:** Decide whether the first cloud environment starts fresh or receives local projects and their matching media. Do not switch active connections or copy accounts/content until the migration scope and rollback plan are explicit.

## Database migration sequence — still pending

1. Restore working dashboard access and verify the intended project and free plan.
2. Implement and test the identity-schema and hosted provisioning changes above; storage is already integrated independently.
3. Configure the project endpoint and necessary server-only credentials through ignored local configuration, never through chat or committed files. Any new credential creation or privileged access through the UI requires action-time confirmation.
4. Run read-only target/TLS/role preflight, then apply the reviewed application bootstrap to the intended project.
5. Test restricted tenant access, job processing, private upload/download, ranged video playback and persistence across restarts.
6. Record actual results and connection status in [Project status](PROJECT-STATUS.md). Keep hosted API/rendering-worker deployment as separate work; Supabase storage does not render motion graphics.

## References

- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres): choose the appropriate direct or session-pooled connection for the host and task.
- [Supabase managed auth schema](https://supabase.com/docs/guides/auth/managing-user-data).
- [Private storage access controls](https://supabase.com/docs/guides/storage/security/access-control).
- [Newbert database workflow](../packages/database/README.md).
- [Workflow and hosting boundaries](SIMPLE-WORKFLOW-AND-HOSTING.md).
