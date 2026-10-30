# F6 — Durable processing, usage and private media

Date: 30 October 2026. Status: complete for review as a local infrastructure slice.

## Delivered

- Atomic version/job/workspace reservation/global reservation/outbox/idempotency transaction; quota or capacity failures roll it all back.
- Separate restricted worker process, durable polling, fair workspace claims, per-workspace/global concurrency, leases, heartbeat and fencing.
- Restart recovery, bounded crash retries, durable pause/resume, explicit retry on the original version, cooperative running cancellation and exactly-once terminal settlement.
- Uncertain provider submissions pause for reconciliation; they cannot be blindly repeated or refunded. No actual provider adapter is connected in this milestone.
- Private local object storage, immutable object keys, session-bound signed access, safe MIME types, integrity checks and ranged reads.
- Fenced artifact registration with atomic workspace/global byte limits and incurred-storage entries. Failed/stale publication stays inaccessible and can be identified as an orphan.
- Live usage API/UI: completed/reserved/remaining processing slots, UTC reset and storage totals; capacity/operational error messages distinguish allowance exhaustion from short auth rate limits.
- Operator pause/resume/status, private-media dry-run audit and worker-aware readiness. Pausing admission never deletes drafts or silently enables provider spending.

See [ADR 003](../decisions/ADR-003-DURABLE-PROCESSING.md) for limits, trust boundaries and tradeoffs.

## Running and controls

With local PostgreSQL running:

```powershell
npm run db:migrate
npm run auth:setup
npm run worker:setup
```

Then run each in a separate terminal:

```powershell
npm run dev:api
npm run dev:worker
npm run dev:web
```

Public local UI: `http://127.0.0.1:3001`; API: 3100. Both API auth origins must match the web origin. For compiled startup use `build:web`, `build:api`, then `start:web`, `start:api`, `start:worker`. Credentials remain in ignored local files.

```powershell
npm run processing -- status
npm run processing -- pause
npm run processing -- resume
npm run media:audit
```

The last command is read-only by default. `-- --apply` removes only unregistered UUID objects older than 24 hours under the exact private local root, skips running workspaces, and never removes a registered artifact. It is not the full future retention policy. Registered-storage usage is not refunded on job cancellation because those bytes remain stored.

## Verification

Fourteen real-PostgreSQL cases cover concurrent duplicate admission, quota races and rollback, platform caps/pause, cancellation/refunds, fairness/concurrency/outbox acknowledgement, expired leases/fencing, unknown provider outcomes, running cancellation, exactly-once usage, explicit retry, signed/ranged private media, role isolation, storage quotas/stale publication and bounded crash recovery. Repeat with `npm run test:f6`.

The combined F5/F6 browser suite exercises a live worker from submission to safe pause and cancellation/refund. Infrastructure readiness returns 200 while database, identity, private storage and worker heartbeat are healthy. [Browser results](../ui/f5-f6/validation-results.json); [combined validation](../db/f5-f6-validation-results.json).

## Explicit boundaries

Planning requests currently pause at the unconnected scripting stage. Video production is rejected before admission. No Gemini, ElevenLabs or rendering request is made, and no fake output is created. F7–F10 must add stage handlers and actual provider/resource accounting before enabling them. Local limits need measured workload evaluation before a public pilot. Cloud storage, full retention/backup/reconciliation tooling, public hosting and Instagram remain later release work.
