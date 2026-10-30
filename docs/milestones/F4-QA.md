# F4 independent QA — 30 October 2026

Result: core account flows and automated regressions pass; one medium-priority UI defect remains open. Application code was not changed during this review.

## Verification

- `npm run check:web`, `npm run check:f3`: passed.
- `npm run build:web`, `npm run build:api`: passed.
- `npm run test:f4`: 1/1 passed.
- `npm run test:f4:browser`: all 13 live-browser checks passed against the running Next/Fastify/PostgreSQL application.
- `npm run test:f3`: 16/16 passed.
- `npm run test:f2`: 7/7 passed.
- `npm test`: 23/23 passed.

Total: 47 automated tests plus 13 browser checks passed. Browser checks cover registration, local verification callbacks, verified sign-in, cookie protection, saved timezone, six workspace routes, sign-out, reset and password change, and account/workspace layouts at the recorded desktop/mobile widths. Test accounts are retained by the existing browser suite.

Additional direct browser review confirmed the desktop homepage and 360px homepage/sign-in layouts are readable, failed sign-in shows an error and re-enables submission, and missing-token reset disables submission and offers a link to request another token. Full keyboard, screen-reader, device, SMTP and production deployment verification are outside this pass. No external email or paid provider calls were made.

## Finding — P2: verification success without evidence (resolved in commit review)

Reproduction: open a fresh anonymous browser at `http://127.0.0.1:3001/verify-email`, without following a verification message or sending a verification API request.

Actual: the page displays “Your email is verified” and “You can now sign in to your workspace.” The shared auth component selects the success copy whenever the query has no `error`; it does not establish that verification occurred.

Expected: direct/missing-state visits show neutral guidance to follow the verification email or request another link. Confirm success only using trusted verification evidence. A caller-controlled success query alone would not establish that evidence. Add a negative browser check alongside the current successful callback test.

Location: `apps/web/components/auth.tsx`, success title/description and verification branch. This is misleading UI feedback, not a demonstrated authentication bypass: server-side verification enforcement passed the integration suite.

Resolution: the page now uses neutral guidance and offers another verification link. It does not treat the absence of an error or a caller-supplied success query as proof of verification. The isolated production-build browser run passed the direct-visit regression and the actual verification/sign-in journey, with 14 account/homepage checks in total.

## Minor UX observation

The reset page without a token displays the normal new-password form with a disabled submit button but no explanation of why it is disabled. It does offer “Request a new reset link.” An explicit missing/expired-link message would make this state clearer.
