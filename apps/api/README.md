# API foundation

F2 implementation uses strict TypeScript and Fastify: `npm run dev:f2` for development, `npm run build:api` then `npm run start:api` for compiled execution. See [PostgreSQL setup](../../packages/database/README.md). Configure `API_HOST`, `API_PORT`, and restricted `RUNTIME_DATABASE_URL` in this folder's ignored `.env`. The API never uses the migration/owner URL.

F2 `/health/ready` measures actual database connectivity/role/schema status. Overall readiness stays 503 until media storage is implemented. `/api/v1` business features and authentication are not implemented yet. The `.mjs` entry below is retained as the separate F1 reference; `.ts` is the selected implementation path going forward.

Run `npm run dev:f1` from the repository root with Node.js 22+. Optional settings: copy this folder's `.env.example` to `.env`. Default address is `http://127.0.0.1:3100`, separate from the prototype on port 3000.

- `GET /health/live` → 200, HTTP process is alive.
- `GET /health/ready` → 503, database/media are deliberately not connected in F1.
- Business routes, including `/api/v1/*`, are not implemented yet and return 404.

This dependency-free Node HTTP entry is a small bootstrap boundary, not a final framework/auth/database decision. F2 will record that stack choice and adapt this boundary. No root prototype store, credentials or video generation is imported here.

Future modules belong in `src/modules/` and use the agreed API contracts. No live-provider calls or cloud resources are needed for F1.
