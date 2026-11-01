# F12 — platform voice and allowance settings

31 October 2026. Scope revised with the user: retain the platform-configured AI voice and defer personal provider-key connections. No recording, uploads, cloning or personal API-key setup is required. F13 Instagram authorization remains next; publishing is still F14.

## Delivered

Settings now shows automatic platform narration and script configuration, platform pause state, actual video-duration and spoken-character caps, and the current free-plan output-use restrictions. Configured means the operator supplied local configuration; it is not a claim that the provider key, entitlement or balance was just checked. Those checks remain part of generation. Opening or refreshing Settings makes no provider requests.

Seven allowance cards report used, reserved, limit and remaining: shared processing requests, script/discussion requests, speech requests, speech characters, narration milliseconds shown as seconds, rendering milliseconds shown as seconds, and private storage. The screen explains that these are workspace platform allowances rather than a live provider balance. Shared platform/provider capacity can still pause admitted work. Daily limits reset at 00:00 UTC, independently of the workspace timezone; storage has no daily reset.

Recent usage shows the existing paginated settled ledger. Waiting reservations remain in the totals. There are explicit loading, empty, exhausted, paused, stale-data and retry states. Summary refresh runs every 30 seconds while the page is visible; the manual refresh also reloads the first history page. The project allowance card links to Settings and uses “used” rather than claiming all incurred attempts completed successfully.

## Accounting and API

GET /api/v1/generation-settings is authenticated and read-only. It exposes only configuration booleans, fixed platform voice mode, policy flags and numeric pilot caps. It never returns a credential, hash, key reference or configured voice identifier. No settings endpoint changes operator budgets or provider secrets.

GET /api/v1/usage now includes speech_requests, counted from durable submitted speech-call records for the current workspace and UTC day. Uncertain submitted calls count; yesterday's calls and other workspaces do not. Speech request counts have no advance reservations: waiting speech-character/time reservations are reported separately and queue jobs can still meet a request cap at execution.

Media allowance reporting now uses the lower of the saved daily bucket limit and the current operator policy ceiling, matching reserve_media_resource. Existing used/reserved work is never erased when a limit is lowered; remaining is clamped to zero. UTC periods are calculated from the database transaction clock. Worker request-count caps and reported request limits use the same constant (two per workspace / four global per UTC day, separately for planning and speech).

No database migration or new secret storage is needed. Existing tenant row security protects usage and ledger data. Fourteen migrations and 34 domain tables remain current. Proposed personal-key routes stay marked deferred in the design contract and are not implemented.

## Verification

Four isolated real-PostgreSQL cases cover authenticated/masked/no-provider settings reads, tenant-separated usage and current lowered limits, cancellation releasing reservations, pause flags, UTC reset/storage behavior, and uncertain submitted speech counts. Queue/accounting regressions are rerun. Browser checks cover all seven cards, empty usage, live refresh, exhausted limits, pause messages, stale snapshot recovery and 1440/768/390/360px layouts. Evidence: docs/db/f12-validation-results.json and docs/ui/f12/validation-results.json.

Backend/web builds and type checks plus OpenAPI validation are required before local review. No live AI credits are used by these checks. Existing human voice/educational-quality, accessibility, hosted operations and retention release gates remain unchanged. This completes the revised F12 scope; encrypted personal-provider connections remain a separately deferred option.
