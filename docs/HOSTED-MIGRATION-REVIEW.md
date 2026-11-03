# Live Supabase migration for review

**Approved and applied 3 November 2026.** Target: existing Supabase project **bwekgdqczkunygcvrkaf**, private bucket **NewbertAiVideo**. The direct Supabase integration is connected. The approved application schemas and data are now present and verified.

## Proposed changes

1. Create the dedicated `newbert` and `newbert_auth` schemas with **41 tables**, application functions, indexes, triggers, row-security policies and grants from the verified PostgreSQL export. Leave Supabase's managed `auth` and `storage` schemas and unrelated tables unchanged.
2. Create the NOLOGIN group roles `newbert_runtime`, `newbert_identity` and `newbert_worker`. All are NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE and NOREPLICATION.
3. Import **345 existing application rows**, preserving accounts, password hashes, session records, workspace/project identities, immutable versions, job state and artifact references. Restore constraints and verify counts and content hashes against the source export.
4. Provision separate restricted API, identity and worker login credentials, each granted only its corresponding group role. Keep credentials in ignored local/server settings; never run the application as the Supabase admin role.
5. Copy **15 registered private local media objects** into this project's private `NewbertAiVideo` bucket. These include generated application audio/video/planning artifacts. Verify each object's size and SHA-256 after upload; retain every source file and local record.

These actions create persistent application structures and access grants, and transfer private account/project/media data to the named Supabase project. They do not authorize deleting local data, changing account security, exposing the bucket publicly, buying resources or upgrading plans.

## Completed preservation work

- Obtained official PostgreSQL 17.11 backup/restore clients in ignored local tooling.
- Created a full private source backup and restored it into a separate verification database: **6 projects and 13 workspaces** matched.
- Applied the tested local namespace migration from `auth` to `newbert_auth`; source history now records 16 migrations. No account records were removed.
- Exported only the two application schemas with PostgreSQL tools, split into pre-data/schema, data and post-data/constraints. Client-only `\restrict`/`\unrestrict` lines are removed before integration SQL execution; application SQL/data are preserved.
- Recorded per-table counts and deterministic data hashes. Data exports, session/provider secrets and backup details remain under ignored `.local/migration`.
- Verified all 15 local registered media objects against database sizes and hashes. No cloud copy completed yet.

## Approval and outcome

Automatic approval rejected the first external schema request because this exact live role/schema/function/grant change needs specific approval. A separate automatic review also rejected copying the 15 private media objects because that exact transfer needs approval. Follow-up read-only inspection confirms hosted application tables remain absent. Do not evade either rejection through a different SQL surface or upload tool.

Approve the specific database and private-file transfer above before retrying. After migration, Linux container verification, free Render deployment, transactional email configuration, backend wiring and full online acceptance remain separate gates.

The user explicitly approved the database and private-media migration. Schema/data/constraints were applied, all 41 tables and 345 rows matched source hashes, and all 15 media objects were copied and verified. Restricted runtime logins passed seven TLS/privilege/isolation checks. Two private function search paths were pinned; Supabase security advisors then returned no findings. No local files deleted or paid resources created. [Verification record](deployment/hosted-migration-validation.json). Live email, Linux container checks and Render/Vercel backend integration remain pending.

The user explicitly approved the database and private-media migration. All 41 tables/345 rows match the source hashes; 15 media objects were copied and verified. Seven restricted-role TLS/isolation checks passed. Two private function search paths were pinned; Supabase security advisors returned no findings. No local files were deleted or paid resources created. [Evidence](deployment/hosted-migration-validation.json).
