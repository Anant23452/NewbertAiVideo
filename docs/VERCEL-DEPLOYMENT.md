# Vercel frontend deployment

Updated: 3 November 2026.

## Build configuration

Deploy this repository with **Root Directory `.`**, **Next.js framework**, and the checked-in `vercel.json`. It sets Build Command to `npm run vercel-build` and Output Directory to `apps/web/.next`. The build script runs `next build apps/web`, where the actual App Router lives. Do not run plain `next build` at repository root. Keep the root lockfile and install dependencies there with `npm ci`.

The failing deployment ran a Next build in a directory with no `app` or `pages`. The repository now supplies an explicit app directory and artifact location. Do not also set Root Directory to `apps/web` with this root-level build command.

## Frontend versus complete service

Vercel publishes the Next.js frontend. It does not start this repository's Fastify backend, PostgreSQL or FFmpeg worker. Supabase currently provides private media storage; it does not replace those processes.

Set `API_INTERNAL_ORIGIN` to the separate reachable **HTTPS backend origin** before enabling account/video workflows. Do not set it to localhost, the frontend itself or a Supabase project URL. Configure the backend's trusted `APP_ORIGIN` and `AUTH_BASE_URL` to the intended frontend origin, provision hosted database/worker access, and verify sessions, jobs and private media end to end.

Without `API_INTERNAL_ORIGIN`, Vercel builds a frontend-only deployment: API requests return an explicit non-cacheable 503 `BACKEND_NOT_CONFIGURED`. Local development retains its loopback API proxy. Cloud configuration rejects insecure, credential-bearing and known self-referencing origins instead of silently proxying to localhost.

Do not copy root `.env` into the frontend project. Gemini, ElevenLabs and Supabase server secrets belong to backend/worker configuration; none need a `NEXT_PUBLIC_` variable. Ignored `.env`, `.local`, private media and `.vercel` files must remain uncommitted.

## Verification

- Run `node --test tests/deployment/vercel.test.mjs` and `VERCEL=1 npm run vercel-build` (PowerShell: `$env:VERCEL='1'`).
- Verify the exact pushed commit's Vercel check reaches success; check the deployment's homepage, security headers and missing-backend behavior or configured backend readiness.
- A successful frontend build is not acceptance of live login/video generation. Keep those release gates open until the hosted backend/database/worker have been verified.

Deployment result is recorded in [Project status](PROJECT-STATUS.md).
