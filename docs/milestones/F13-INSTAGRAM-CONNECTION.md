# F13 — Instagram connection lifecycle

1 November 2026. Local implementation under review; live Meta app/account acceptance is blocked. No real Instagram account has been connected, no tokens imported from a browser session, and no content posted.

## What is implemented

Settings and Publishing now share the same owned Instagram status. Missing operator configuration produces an honest setup-required screen. Once configured, the user explicitly acknowledges profile and future publishing access, then follows Instagram Login. Connecting does not authorize a post; scheduling and publishing remain F14.

Authorization uses a random 256-bit state, stored only as a hash, bound to the Newbert session and current workspace connection generation, with a ten-minute expiry. CSRF and trusted-origin checks protect authorization, renewal and disconnect. Only /app/settings and /app/publishing return paths are accepted. Replacing a connection requires its current ETag and pauses deliveries. At most ten authorization starts per workspace per ten minutes are accepted.

Callback state is consumed and committed before the external code exchange. Refreshing a callback or repeating an ambiguous exchange cannot submit it again. Expired, cancelled, superseded, different-session and different-workspace callbacks cannot connect an account. A workspace generation counter prevents an in-flight callback from reconnecting an account after a concurrent disconnect, including when there was no previous connection.

The server-side adapter uses Instagram Login, a pinned operator-selected API version, fixed official endpoint hosts, bounded responses, timeouts and redirect rejection. It requires the returned granted permissions and professional profile fields. The adapter exchanges a short-lived token for a long-lived token and records the returned expiry. Live acceptance must confirm the actual response shape and account identity fields; there is no speculative fallback from missing permissions or profile fields.

A fresh OAuth grant creates a new connection ID. Partial unique indexes enforce one current connection per workspace and one current owner per remote account. Pending deliveries/schedules pause on reconnect, disconnect, expiry or rejected access. In-flight publishing transitions to reconciliation_required instead of blindly resuming. Previously authorized deliveries never automatically inherit a new grant.

Access tokens are AES-256-GCM encrypted in a tenant-owned secret table. Authenticated associated data binds ciphertext to workspace, connection and secret ID. A connection holds only the secret reference. Browser responses exclude tokens, remote account IDs, key hashes and secret references. Audits record action/actor/target/request IDs without OAuth codes or tokens. The worker cannot read this secret table in F13; future publishing requires a separately reviewed grant and execution boundary.

Renew access retains the same connection identity but changes its revision, encrypted secret and expiry. It is permitted only after 24 hours for an active unexpired connection. Rejected access, missing ciphertext, decryption failure or expiry requires a new sign-in and pauses deliveries. Renewal is manual in this local slice; a monitored automatic refresh service is a production/F14 prerequisite. Disconnect atomically removes the stored secret and invalidates pending callbacks. This is a local disconnect; users revoke remote app permissions in Instagram's Apps and websites settings.

## Local operator setup

1. Run npm run db:migrate. Migration 0014 adds the encrypted secret table, connection-generation column, OAuth context, narrow runtime grants and delivery-pause function. Total: 15 migrations / 35 domain tables.
2. Run npm run instagram:setup. This creates .local/instagram-token.key once and preserves it on reruns. No value is printed. The ignored key file is for loopback development only; hosted production requires a dedicated INSTAGRAM_TOKEN_KEY from a secret manager. Never regenerate a key used by existing tokens without a rotation/reconnect plan.
3. Create the Meta developer app manually or after browser access is restored, using the Instagram Login product for the intended professional account. Verify current product, scope, app-role/review and version requirements in the Meta dashboard. These have not been validated with the user's real app.
4. Store INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_API_VERSION in ignored apps/api/.env. The Instagram product's ID/secret must match the chosen login flow. Never paste secrets or access tokens into chat or project documents.
5. Register exactly APP_ORIGIN + /api/v1/instagram/callback with Meta. INSTAGRAM_REDIRECT_URI must equal that address; arbitrary callback origins are rejected. A hosted HTTPS origin requires the web/API session configuration to use that same origin. Local HTTP support in our adapter is not evidence Meta accepts that callback; use a reviewed HTTPS development environment if Meta requires it. No public tunnel is started automatically.
6. Run npm run instagram:check. It prints only configuration readiness/missing field names and makes no provider calls. Restart the API after editing server configuration. Sign into Newbert on the same origin and use Connect Instagram; complete Meta sign-in/consent yourself.

At delivery, local encryption storage is prepared, but app_id, app_secret and api_version are missing. All account tests use simulated provider responses, never the user's Meta account. The browser tool repeatedly denied developers.facebook.com under a saved permission/managed policy, and automatic approval review rejected another attempt. This implementation does not bypass that restriction through another browser surface, session import, raw CDP or account API calls.

## Working API

- GET /api/v1/instagram/connection — own safe metadata plus operator setup flags; ETag when a current connection exists.
- POST /api/v1/instagram/authorization — acknowledgedAccountAccess=true and an allowlisted returnPath; X-CSRF-Token required, current If-Match when reconnecting.
- GET /api/v1/instagram/callback — session-bound single-use state; redirects only to fixed app paths with safe result codes, no secret response data; Referrer-Policy: no-referrer.
- POST /api/v1/instagram/connection/refresh — session CSRF and current If-Match; no account substitution.
- DELETE /api/v1/instagram/connection — session CSRF and current If-Match when connected; 204 when already disconnected.

## Verification and live release gates

Integration checks cover configuration/CSRF/acknowledgement gates, authenticated encryption, state lifetime/replay/cancellation/session binding, tenant isolation, callback/disconnect races, grant replacement, account exclusivity, expiry/renewal, strict provider response checks and paused/uncertain deliveries. Database regressions cover migration replay, grants and isolation. Browser checks cover setup-required status, required acknowledgement, a simulated connected account, both Settings/Publishing, renewal errors, explicit disconnect and responsive layouts. Evidence is recorded in docs/db/f13-validation-results.json and docs/ui/f13.

Live acceptance still requires the user's Meta app configuration and account authorization, official permission/version/profile response verification, HTTPS callback testing, account role/app review as applicable, remote revocation/deauthorization handling, automatic refresh, key/DB backup/retention and public-release security checks. This milestone must not be described as a successful live Instagram connection. F14 posting/scheduling is not implemented.

## Official references checked

- Meta's maintained API collection: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Instagram Login product: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- Business Login: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/
- Token reference: https://developers.facebook.com/docs/instagram-platform/reference/access_token/

Meta documentation pages returned HTTP 429 during research. The official collection supports the professional-account requirement, but its Facebook Login examples must not be mixed with the Instagram Login adapter. Current live dashboard/API validation remains required; mock tests alone do not establish Meta compatibility.
