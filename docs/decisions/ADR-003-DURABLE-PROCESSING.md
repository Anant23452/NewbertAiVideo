# ADR 003 — Local project processing foundation

Date: 30 October 2026. Status: accepted for the F5/F6 local implementation.

## Decision

Use the existing PostgreSQL project/version/job/usage/outbox schema, with a separate Node/TypeScript worker. Do not introduce Redis or a hosted queue for this slice. Job rows are the durable source of truth; outbox rows are committed with admission and acknowledged transactionally when the worker claims the corresponding job. Database scanning recovers missed wakeups without relying on in-memory messages.

The API has tenant RLS and narrow feature writes. Identity and worker logins remain separate. The worker uses explicit policies on its processing tables, not superuser or BYPASSRLS, and has no auth-table permissions. Operator setup uses the existing local owner only for migrations/configuration. Browser identity never comes from a supplied workspace ID.

Submission freezes a version, reserves workspace/global capacity, creates the job, and writes the outbox and idempotency response in one transaction. Conflicting drafts use strong ETags. Deterministic sorted-key JSON is SHA-256 hashed. Submitted versions remain immutable in PostgreSQL.

Claims use short transactions, `SKIP LOCKED`, a global claim lock, per-workspace active counts, and oldest last-claimed workspace ordering. Leases expire after 30 seconds and carry increasing fencing tokens. Heartbeat, completion and artifact publication reject stale leases. Three crash recoveries pause a job for manual attention. Submitted/unknown provider attempts pause rather than replay; reservations are retained for reconciliation.

## Local limits and storage

Conservative development defaults: three daily processing slots per workspace, twenty globally, one running job per workspace, two globally, 10 MiB registered private storage per workspace, 100 MiB globally, and 10 MiB maximum per local object. Generation periods reset at UTC midnight; stored bytes have a lifetime bucket. These are configurable local limits, not measured or promised public pilot allowances. Narration, rendering and paid-provider limits remain zero/disabled until their stages implement measured reservations and settlement.

Private objects live in ignored `.local/private-media`, outside the Next public directory. UUID keys, exclusive atomic publication, file flushing, metadata hashes and a fenced metadata/usage commit protect storage. Failed commits may leave private orphan objects; the local audit reports them and optionally removes unregistered objects older than 24 hours. Registered outputs are never deleted by that tool. Full output retention, cloud object storage, backup/restore and deletion holds remain later release work.

Preview/download URLs last two minutes and require the same live session and workspace in addition to their HMAC signature. The server rechecks authorization, object state, length and hash, accepts a MIME allowlist, and supports single byte ranges. Signed URLs expose no filesystem paths or storage keys.

## Boundaries

F6 intentionally has no Gemini, speech, or rendering handlers. A real planning job enters the queue and pauses with `PIPELINE_NOT_READY`; it does not become a pretend success. Produce requests are rejected before reservation. The old feasibility generator is not invoked by this worker. F7–F10 must use the lease, attempt, quota and artifact boundaries before enabling provider calls. Paid-provider flags alone are never an implementation of stage accounting.

Readiness now means identity, database, local storage and a recent worker heartbeat are healthy. It does not mean the full video product is ready. Hosting, external SMTP, 20-topic evaluations and Instagram remain outside these milestones.
