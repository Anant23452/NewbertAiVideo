# ADR 002 — identity boundary and atomic workspace bootstrap

Date: 30 October 2026. Status: implemented in F3, pending milestone review.

## Decision

Better Auth 1.7.14 owns email/password credentials, verification/reset tokens, server sessions and durable auth rate-limit records in a private `auth` schema. Its PostgreSQL adapter uses explicitly enabled transactions. Auth SQL was generated from the selected configuration, reviewed and committed as an ordered forward migration; normal API startup never generates/migrates tables.

The user-insert trigger creates the domain identity, one private workspace, dispatch row and private identity binding **inside the same database transaction**. A failed credential insert rolls all of them back. An after-commit application hook is not used for this invariant. Unverified users have a workspace but cannot sign in/use it until verification. No auto-login after verification.

The identity login inherits only `newbert_identity`. It can maintain Better Auth tables and call the narrow `newbert.resolve_identity(subject)` function, but cannot read project data. The tenant API login inherits `newbert_runtime`, has tenant RLS and limited workspace preference writes, and cannot read credentials/bindings or call the identity resolver. The migration owner remains outside both runtimes.

Bootstrap/resolver/session-status functions are SECURITY DEFINER with fixed `pg_catalog` search paths, qualified names, no caller-controlled dynamic SQL, and PUBLIC execution revoked. The trigger temporarily sets/restores the new workspace's transaction-local RLS context. Binding records are not writable by either runtime. Account status is checked inside session insertion and every protected domain request, so disabling an account blocks access even if an old cookie remains.

## HTTP/session rules

- Auth routes are explicitly allowlisted under `/api/auth`; business identity endpoints are `/api/v1/me` and `/api/v1/workspace`.
- Request URLs are constructed from configured trusted origins, not Host/forwarded headers. POST auth requests require exact Origin and JSON, including login/signup/reset flows. No wildcard CORS is enabled.
- Better Auth retains its own origin, redirect, CSRF and Fetch Metadata safeguards. Application mutations, logout, revoke-all and password change additionally require the session-bound CSRF value returned by `/me`.
- Cookies are HttpOnly, SameSite=Lax, host-only and Secure on HTTPS; plain HTTP is allowed only for explicit loopback development. Production configuration requires HTTPS and SMTP. No bearer/session token is returned in JSON.
- Sessions last up to seven days, cookie caching is disabled for immediate revocation, and session refresh is deferred to explicit, CSRF-protected POST `/api/auth/get-session`. Its GET counterpart is read-only and reports `needsRefresh`. Password reset revokes all sessions; password change forces other-session revocation even if a caller requests otherwise.
- Reset/verification links expire after one hour; invalid or expired credentials do not bypass the library checks. Account deletion, email changes and social login are not exposed in F3.
- Auth throttling is database-backed. The HTTP adapter translates the library's `X-Retry-After` into standard `Retry-After`. Client-provided forwarding/IP headers are stripped and rate-limit identity comes from Fastify's peer address. A deployment proxy allowlist remains a release configuration task.

Unexpected auth/database faults propagate to Fastify's sanitized boundary. This avoids the underlying router's fallback console logging, which otherwise can print PostgreSQL row details even with ordinary auth logging disabled. No passwords, reset URLs, verification URLs, session tokens or raw database failures are logged by application code.

## Email and future UI

Local mode writes mail to ignored `.local/auth-mailbox/`; no public HTTP endpoint serves it and no external mail is sent. This is a test/development transport, not delivery to a user's inbox. SMTP support uses TLS and timeouts, but external provider delivery has not been tested without configured credentials. A delivery failure may leave a registered, unverified account; resend-verification is the recovery path. No session is granted before verification.

F4 must implement the approved forms, verification/recovery routes, safe return-path/topic preservation, CSRF submission, refresh behavior and accessible states. Auth backend completion is not a claim that a usable browser account journey has shipped. The local prototype's custom auth stays separate.

References: [Better Auth Fastify](https://better-auth.com/docs/integrations/fastify), [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql), [session behavior](https://better-auth.com/docs/concepts/session-management), [security](https://better-auth.com/docs/reference/security). Installed library code/schema and real PostgreSQL tests verify the exact integration used here.
