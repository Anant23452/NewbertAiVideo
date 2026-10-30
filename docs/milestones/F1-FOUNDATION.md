# F1 — project tracking and application foundation

Date: 30 October 2026. Status: complete for review. Scope: initial project scaffold only.

## Intended outcome

A new contributor can locate the approved designs/contracts, see the remaining work, and start a small API foundation without confusing it with the previous feasibility app. F1 makes no cloud, frontend framework, auth, database or provider purchase decision.

## Acceptance checklist

- [x] Central status document records completed work, unfinished features, dependencies, decisions and release gates.
- [x] Separate API, web, worker and shared-contract boundaries exist.
- [x] F1 has its own environment example; no root secrets/data are imported.
- [x] Existing prototype startup remains unchanged.
- [x] Liveness is distinct from dependency readiness; no pretend connected services.
- [x] Syntax and HTTP smoke checks pass; results recorded below.

## Run

```powershell
npm run dev:f1
npm run check:f1
```

Default liveness URL: `http://127.0.0.1:3100/health/live`. Readiness returns 503 until real required dependencies are integrated. Stop the local API with Ctrl+C. This scaffold needs no new npm dependencies.

## Verification

Passed `npm run check:f1` for all three foundation modules. A temporary loopback server on an ephemeral port passed GET liveness 200, GET readiness 503 (`not_ready`), unknown API route 404, POST health 405, and HEAD health 200 with an empty body. Every response included a request correlation header. Invalid-port configuration was rejected. The smoke server was closed afterward, and no provider request or database operation was made.

These are foundation checks, not production authentication, security, database or cloud verification. F1's Node HTTP bootstrap is deliberately framework-neutral; do not treat it as an approved final application framework.

### Independent QA — 30 October 2026

Result: passed within F1 scaffold scope; no blocking defect found in the exercised cases. Added repeatable coverage in `tests/f1.test.mjs`, run through the existing `npm test` command.

- `npm run check:f1` and `npm run check`: passed.
- `npm test`: 23/23 passed (five new F1 tests and all 18 prototype regression tests, including actual MP4 encode/decode).
- HTTP coverage: GET/HEAD liveness and readiness, query strings, unknown API routes, trailing-slash behavior, POST/PUT/PATCH/DELETE/OPTIONS rejection on both health endpoints, Allow headers, unique request IDs, problem-response correlation, and no-store/nosniff headers.
- Configuration coverage: defaults, custom host/port, ephemeral port zero, upper bound, invalid ports, and separation from prototype HOST/PORT settings.
- Bootstrap failure coverage: invalid configuration and an occupied port exit with status 1 and a useful message.
- Existing prototype startup commands remain unchanged; F1's startup command selects its own optional environment file.

Web, worker and shared-contract folders are documented boundaries with no executable implementation in F1. Their runtime behavior cannot yet be tested. This pass does not verify graceful shutdown, production features, live providers, database integrations or deployment. QA made no paid provider calls.

## Next milestone

F2: decide/record the actual frontend/backend/auth stack, establish local PostgreSQL and reviewed migration workflow. No UI feature implementation, live generation, account publishing or deployment is authorized by completion of F1 alone.
