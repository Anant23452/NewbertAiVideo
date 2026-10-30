# API foundation

Run `npm run dev:f1` from the repository root with Node.js 22+. Optional settings: copy this folder's `.env.example` to `.env`. Default address is `http://127.0.0.1:3100`, separate from the prototype on port 3000.

- `GET /health/live` → 200, HTTP process is alive.
- `GET /health/ready` → 503, database/media are deliberately not connected in F1.
- Business routes, including `/api/v1/*`, are not implemented yet and return 404.

This dependency-free Node HTTP entry is a small bootstrap boundary, not a final framework/auth/database decision. F2 will record that stack choice and adapt this boundary. No root prototype store, credentials or video generation is imported here.

Future modules belong in `src/modules/` and use the agreed API contracts. No live-provider calls or cloud resources are needed for F1.
