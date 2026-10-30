# F5 — Projects, editable briefs and immutable versions

Date: 30 October 2026. Status: complete for review, local implementation.

## Working behavior

- Real project creation, title search, active/archived library and cursor pagination.
- Own-project detail, rename, archive and restore; archived drafts cannot be edited. Archive is the reversible removal operation; hard deletion is not exposed.
- Validated Hindi/Hinglish brief, audience, guided/automatic preference, optional target length, visual preset and saved structured draft. Voice selection and generated scenes are later features.
- Draft editing uses `If-Match`; a stale second tab receives 412 and keeps its unsaved edits. Browser refresh preserves saved data. Reloading a dirty draft asks before discarding edits.
- Queue submission creates a read-only version with original draft revision and deterministic content hash. Later edits never change earlier versions. History is paginated and snapshots are viewable.
- Actual overview/library data and responsive forms replace the F4 project placeholders. No fake projects, schedules, videos or usage counters.

## Security and consistency

Every endpoint validates the cookie-backed identity, uses the resolved private workspace and existing RLS. Mutations require Origin + CSRF. Strict contract-derived schemas reject unsupported fields. Creation and command submissions support scoped idempotency; matching concurrent requests return the same resource, while changed input with the same key conflicts. The browser retains only an uncertain command's hashed fingerprint/key through reload, never passwords or session credentials.

Project and draft revisions are independent. Submission and archive/edit operations lock the project before dependent rows. A project with queued/running/paused work cannot be archived until that work is cancelled. Earlier versions are also protected by the database immutable-version trigger.

## Verification

- Seven real-PostgreSQL integration cases: atomic/idempotent create; cross-account and CSRF rejection; strict schemas; concurrent draft updates; archive/restore; distinct paginated rows; immutable submission snapshots.
- Eleven live-browser checks cover sign-in, create/reload, competing tabs, frozen versions, queue pause/refund, archive/restore, search, private URL protection and browser errors. Create/editor/library layouts fit 1440/768/390/360px. [Results and screenshots](../ui/f5-f6/validation-results.json).
- Frontend/backend type checks and production builds pass. F2/F3/F4 and existing prototype regressions are recorded in the combined validation report.

Repeat: `npm run test:f5`, `npm run test:f5:browser` with API, worker and web running. Browser tests create local test accounts/projects; they never call providers or send external email.

## Next

F6 supplies the durable processing foundation in this same delivery. F7 adds the actual topic/evidence/scripting stage. Current planning submissions pause honestly until that implementation is connected.
