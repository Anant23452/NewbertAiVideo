# API/database review and implementation acceptance

Date: 29 October 2026. Companion to [the design](API-DB-DESIGN-V1.md).

## 1. Verification completed during design

The generated OpenAPI specification passed Swagger Parser structural/reference validation. The reference DDL executed in PGlite (an embedded PostgreSQL engine) with no external database. SQL smoke checks exercise the declared constraints, a quota UPDATE pattern, a fencing predicate, and an RLS SELECT under a non-owner role. Results: [validation-results.json](db/validation-results.json).

This does not validate a production backend, cloud PostgreSQL version, provider integration, concurrent multi-connection behavior, backup restoration, media quality, or Meta publishing. The prototype's earlier application tests are separate evidence and do not implement these API contracts.

Reproduce from the repository root with Node.js and temporary verification dependencies:

```powershell
$designTools = Join-Path ([System.IO.Path]::GetTempPath()) 'newbert-design-validation'
npm install --prefix $designTools --no-audit --no-fund --package-lock=false @electric-sql/pglite @apidevtools/swagger-parser
node docs/api/build-spec.mjs
node docs/db/validate-design.mjs $designTools
```

These tools do not change application dependencies. The generated API file is the UI/backend contract; edit its design generator and regenerate together. Hosting-specific migrations and grants remain implementation work.

## 2. Design decisions to review

| Decision | Recommended resolution | Consequence |
|---|---|---|
| Database | Accept PostgreSQL as logical engine | Hosting/version selection remains later |
| Draft vs version | Editable draft, immutable submitted snapshots | Stable output history and explicit approval |
| Guided review | Plan finishes, creator imports/edits, separate production command | No active job waiting indefinitely for routine approval |
| Automatic mode | Skip manual script approval, retain technical/evidence gates | Fits fully automated creation without bypassing validation |
| Worker queue | Database first, outbox + leases + fencing | No message-broker infrastructure required at V1 |
| Budget windows | UTC platform allowance windows, displayed locally | Timezone changes cannot reset allowance |
| Personal speech key | One current ElevenLabs connection, separately validated | Key replacement requires explicit revoke/create |
| Instagram reconnect | New grant/connection identity, reauthorize waiting posts | A reconnect cannot silently reactivate old posting instructions |
| Artifact retention | Configurable, with holds for live dependencies/delivery | Cleanup never invalidates scheduled or uncertain publication |
| UI contract | Forty operations across nine modules | UI brainstorming can derive exact empty, loading, paused and error states |

Quantities (daily minutes, maximum duration, retention days, concurrency, signed-URL lifetime) remain configuration decisions. Do not turn sample values in the prototype into production limits without measurements.

## 3. Required implementation scenarios

| Case | Expected result | Current verification |
|---|---|---|
| Register twice / duplicate auth callback | One user mapping and workspace | Unique workspace/auth constraints; full identity flow pending |
| A user guesses another project/version/artifact ID | 404; no media access or metadata | Composite FK + tenant RLS SELECT checked; API tests pending |
| Connection B referenced by user A | Reject before queue/provider call | Composite FK design; API integration pending |
| Same draft edited in two tabs | One update; other returns 412 without overwriting | Revision contract; integration pending |
| Same generation command arrives twice | Replay original response/job and original ETag precondition | Idempotency design; concurrent transaction test pending |
| Same idempotency key with different body | 409, no second reservation/job | Unique scoped record; service hash test pending |
| Different keys race to generate one project | At most one active job; loser 409 | Partial unique index checked; concurrent API test pending |
| Two projects spend final allowance concurrently | Only budget-fitting request commits | Conditional UPDATE checked sequentially; concurrent lock test pending |
| Platform provider budget exhausted | No chargeable request; return actionable capacity state | Transaction design; integration pending |
| Job crosses midnight | Original reservation still reconciled to original window | Schema/design; clock-controlled integration pending |
| Worker crashes after provider accepts speech | Unknown attempt; pause/reconcile, no blind repeat | Attempt model/design; fault injection pending |
| Render fails after successful speech | Retry uses stored audio; no duplicate platform debit | Artifact/debit keys checked structurally; new-worker integration pending |
| Old worker returns after lease reassignment | Stale token cannot checkpoint or replace output | Conditional fencing UPDATE checked |
| Worker succeeds after draft edited | Output stays on original version; draft is untouched | Version immutability checked; end-to-end test pending |
| Last good video exists while new generation fails | Old validated output remains previewable/scheduled | Separate FK design; transactional service test pending |
| Caption/layout-only correction | Audio reuse if spoken fingerprint still matches | Fingerprint contract; regression/evaluation pending |
| Pronunciation or voice change | New speech and dependent timing; no reuse under old fingerprint | Contract; evaluation pending |
| Missing/invalid Hindi alignment or long audio | Pause/fail before Ready; no fabricated timing/truncation | Contract; representative Hindi tests pending |
| Unsupported factual claim | Automatic flow pauses; manual approval cannot invent support | Evidence model; policy/validator tests pending |
| Scheduled old video then edit draft | Intent still targets original asset, caption and grant | Exact-version FK design; schedule integration pending |
| Reconnect or replace Instagram account | Pending intents pause; new explicit authorization needed | Active account uniqueness checked; OAuth integration pending |
| Forged/reused OAuth state or session mismatch | Reject; no token stored or account attached | Hash/single-use model; security tests pending |
| Schedule entered during daylight-saving overlap/gap | Reject ambiguous/nonexistent value; require matching offset | API policy; timezone tests pending |
| Output not ready by bounded scheduled deadline | Attention/paused; no surprise late post | Policy; scheduler clock tests pending |
| Cancellation races with publish | Pre-dispatch cancel wins; uncertain submitted call reconciles | Intent locking/attempt model; fault injection pending |
| Meta publish response lost | reconciliation_required; safe retry prohibited | State model; provider test account required |
| Job cancelled while provider is working | No later stages/post, preserve incurred usage, final acknowledgement | Contract; worker integration pending |
| Cleanup races with due publication | Referenced object remains retained; serialize hold/deleting transition | Hold design; concurrency test pending |
| Secret/signed URL reaches error logger | Redaction prevents storage/output | Logging acceptance case; implementation pending |
| A creator deliberately submits another publish command | New explicit intent; retries of old command still replay | Product/API distinction; UI confirmation design pending |

## 4. Request sequence for future UI work

Example flow (UUIDs/ETags are illustrative; the endpoints are not live):

```http
GET /api/v1/projects/{projectId}/draft
Cookie: newbert_session=...

HTTP/1.1 200 OK
ETag: "draft:PROJECT_UUID:7"
```

```http
POST /api/v1/projects/{projectId}/jobs
Content-Type: application/json
If-Match: "draft:PROJECT_UUID:7"
Idempotency-Key: 01e66abf-8408-402c-a845-a43b22ba94a8
X-CSRF-Token: SESSION_BOUND_TOKEN

{"kind":"produce","scriptApproved":true,"acknowledgedUsageTerms":true}

HTTP/1.1 202 Accepted
Location: /api/v1/jobs/JOB_UUID
```

The UI polls that job until it succeeds or needs attention. It then requests artifact metadata and an access URL. The production API never returns a local filesystem path. To publish, the UI makes a separate authorization request with the exact video ID, connected account ID, caption and delivery instruction. Generating or downloading never implicitly authorizes posting.

## 5. Next review, then UX

Review a guided generation, automatic generation, a failed speech/render retry, and a scheduled publish against this design. Resolve material API/data changes. Then brainstorm dashboard, idea discussion, draft review, generation progress, video preview, connection settings and scheduling states; use Google Stitch only after those flows are agreed. Cloud provisioning, database migration execution and application UI work are outside this design task.
