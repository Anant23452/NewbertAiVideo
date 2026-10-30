# F3 identity API handoff

Date: 30 October 2026. Backend integration; browser forms arrive in F4. These auth-adapter routes are separate from the main OpenAPI command idempotency model. Do not send provider keys here.

All auth POSTs: `Content-Type: application/json` and `Origin` equal to configured `APP_ORIGIN`. Cookies are stored by the browser; do not copy session tokens into localStorage. Native Better Auth validation/business errors retain their safe library code/message; adapter/security/unexpected errors use the application's problem JSON. Unexpected errors never expose SQL details.

| Route | Body / purpose | Notes |
|---|---|---|
| POST `/api/auth/sign-up/email` | `email`, `password`, optional `name`, optional trusted `callbackURL` | Minimum 12 characters, maximum 128; default display name Creator; verification required; creates workspace atomically; repeated email uses non-enumerating response |
| POST `/api/auth/send-verification-email` | `email`, optional trusted `callbackURL` | Resend if initial delivery failed; rate-limited |
| GET `/api/auth/verify-email?token=...` | Signed link | Does not auto-sign-in; F4 handles completion/expiry states |
| POST `/api/auth/sign-in/email` | `email`, `password` | Verified active identity only; sets HttpOnly cookie; no JSON bearer token |
| GET `/api/auth/get-session` | Session cookie | Sanitized session metadata; no raw token; anonymous requests return 401; disabled identities denied |
| POST `/api/auth/get-session` | `{}` and session CSRF | Explicit refresh when the GET result signals `needsRefresh`; generic custom-field `/update-session` is not exposed |
| POST `/api/auth/sign-out` | `{}` and session CSRF | Invalidates this server session and expires cookie; disabled user can still sign out |
| POST `/api/auth/revoke-sessions` | `{}` and session CSRF | Revokes all own server sessions |
| POST `/api/auth/change-password` | `currentPassword`, `newPassword` and session CSRF | Forces other-session revocation; current-password/fresh-session rules remain library controlled |
| POST `/api/auth/request-password-reset` | `email`, optional trusted `redirectTo` | Same response for absent/existing account; no token returned |
| GET `/api/auth/reset-password/{token}` | Email link callback | Library validates and redirects only to trusted target; F4 supplies the reset form |
| POST `/api/auth/reset-password` | `token`, `newPassword` | Single-use, expiring link; weak password rejection does not consume valid link; revokes existing sessions |
| GET `/api/v1/me` | Session cookie | Domain user/status, own workspace and CSRF token; no email/token/secret references |
| GET `/api/v1/workspace` | Session cookie | Own workspace only; supplies ETag |
| PATCH `/api/v1/workspace` | `timezone`, Origin, X-CSRF-Token, If-Match | IANA timezone only, no owner/ID changes; 428 missing revision, 412 stale revision, 422 invalid input |

Use `credentials: 'same-origin'` when F4 proxies API traffic through the web origin. Retrieve `csrfToken` from `/api/v1/me`; send it as `X-CSRF-Token` for protected mutations. CSRF is tied to a server session and must be discarded on logout. Workspace ETag format: `"workspace:UUID:REVISION"`. Do not use an arbitrary workspace ID supplied by the browser to establish tenant context.

The library controls sign-up/sign-in/verification/reset formats and status semantics. Main business API resource shapes continue to match `openapi-v1.json`. Native identity endpoint requests do not require the business `Idempotency-Key` header; uniqueness and the atomic bootstrap enforce account/workspace consistency. There is no list of other users, direct workspace creation, raw mail viewing, admin/disable endpoint, social login, email-change or delete-user route in this milestone.

Configured backend base URL is the public auth URL; `APP_ORIGIN` is the exact trusted browser origin. Default local setup uses port 3100 and has no UI. F4 must configure a same-origin proxy and update public base/callback origins coherently, rather than enabling broad CORS.
