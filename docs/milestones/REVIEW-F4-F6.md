# F4–F6 commit review

Date: 30 October 2026. Scope: web/auth interface, private projects and durable processing infrastructure present at review start. Concurrent F7 planning changes are excluded from this commit.

## Corrections

- Job listing now honors the documented state filter and rejects unsupported or repeated state values. Regression coverage checks filtered pagination with mixed queued/cancelled jobs.
- Direct visits to the verification landing page no longer claim that verification succeeded. Neutral guidance and a resend link remain available; sign-in still enforces actual server-side verification.
- Browser suites accept `BROWSER_TEST_ORIGIN` so a reviewed build can be checked on separate local ports without interrupting another running app.

## Verification

69 automated tests passed: 23 prototype/F1, 7 F2, 16 F3, 1 F4, 7 F5 and 15 F6. Strict backend and web type checks passed. Backend build and optimized Next.js build passed. A staged snapshot was also compiled independently to exclude files added concurrently by the planning workstream.

The project browser suite passed 11 checks against the local app. The final account/homepage suite passed 14 checks against the isolated reviewed production build, covering the direct-verification regression, registration, verification, sign-in, timezone persistence, logout, password reset/change and responsive layouts.

No external email or paid provider calls were made by the reviewed tests. Planning/video production remains unconnected in this commit; a worker safely pauses at the missing pipeline stage. External delivery, live generation, deployment and full production security remain later work.
