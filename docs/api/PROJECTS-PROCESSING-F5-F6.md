# F5/F6 implemented API handoff

Base: `/api/v1`. Local browser origin: `http://127.0.0.1:3001`, proxied to API port 3100. Other proposed OpenAPI operations remain unavailable unless documented as implemented.

All routes use the live F3 cookie session and resolved workspace. Mutations require exact Origin and `X-CSRF-Token` from `/me`. Commands require `Idempotency-Key`; keep the same key and exact payload/precondition after an uncertain response. Keys are workspace + operation scoped. A changed request with the same key returns 409. Replays return `Idempotency-Replayed: true` and the original committed response. Idempotency records are not currently pruned; expiry is not permission to execute a duplicate old command.

| Method and route | Behavior / precondition |
|---|---|
| GET `/projects` | Own active/archived projects; `status`, literal title `search`, `limit` 1–100, opaque `cursor` |
| POST `/projects` | Validated `ProjectCreate`; creates project + draft; idempotency; 201 + Location + project ETag |
| GET `/projects/:id` | Own project metadata + ETag |
| PATCH `/projects/:id` | Title/status only; project If-Match; active jobs block archive |
| GET `/projects/:id/draft` | Saved structured draft + draft ETag |
| PATCH `/projects/:id/draft` | Complete validated `content`; draft If-Match; archived project rejects write |
| GET `/projects/:id/versions` | Read-only version page, limit/cursor |
| GET `/versions/:id` | Exact immutable snapshot, hash and available artifact IDs |
| POST `/projects/:id/jobs` | `kind: plan`, `acknowledgedUsageTerms: true`, draft If-Match, idempotency; freezes version/reserves/queues atomically; 202 |
| GET `/jobs` | Own jobs; optional projectId/state, limit/cursor; unsupported states return 400 |
| GET `/jobs/:id` | Sanitized state/pause/error and job ETag; poll at suggested interval |
| POST `/jobs/:id/cancel` | Job If-Match + idempotency; waiting/paused cancel immediately; running work acknowledges cooperatively |
| POST `/jobs/:id/resume` | Eligible paused job, job If-Match + idempotency; retains original version/reservation |
| POST `/jobs/:id/retry` | Failed/cancelled original job, job If-Match + idempotency + explicit `allowNewProviderRequest: true`; reserves a new job on the same version |
| GET `/usage` | Real daily processing and lifetime stored-byte totals; aggregate capacity state only, never global budget rows |
| GET `/usage/entries` | Own incurred usage page |
| GET `/artifacts/:id` | Own available private metadata; no storage keys or filesystem paths |
| POST `/artifacts/:id/access` | Validated passed artifact, `purpose: preview/download`, CSRF + idempotency; two-minute URL |
| GET `/media/:id` | Signed delivery URL plus the same live session/workspace; integrity/MIME checks and single byte ranges |

ETags: `"project:UUID:REV"`, `"draft:PROJECT_UUID:REV"`, `"job:UUID:REV"`. Missing required If-Match returns 428; stale returns 412; foreign/missing items return 404. Validation rejects unknown properties. Quota exhaustion returns 429; closed admission/global capacity returns 503. No reservation is committed on rejection.

Current queue boundary: the worker pauses with `PIPELINE_NOT_READY`; no actual educational content is generated. `produce` requests return 409 before reserving. Unknown provider outcomes and running cancellations retain reservations until safe resolution. Cross-account media links fail even when a valid URL is copied; signing out invalidates them. Fresh access commands need fresh keys after URL expiry.

Stage handler APIs are internal worker modules, not public browser endpoints: `claimNext`, `heartbeat`, `finish`, `recoverExpired`, `saveArtifact`. Provider calls must occur outside DB transactions, use prepared/submitted attempt checkpoints, obey spending/resource gates and publish only through the fenced artifact boundary. Do not call the old prototype generator from the durable worker.
