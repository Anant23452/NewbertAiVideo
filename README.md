# Newbert AI Video

Current stage: **F3 — identity and private workspace backend**. [Project status and complete backlog](docs/PROJECT-STATUS.md) · [F3 scope and verification](docs/milestones/F3-IDENTITY-WORKSPACE.md) · [Database setup](packages/database/README.md).

With local PostgreSQL running: `npm run db:migrate`, `npm run auth:setup`, then `npm run dev:f3`. Auth mail is local-only until SMTP is configured; no real email is sent in development mode. Production registration/session/recovery and own-workspace endpoints are available for integration, while their browser forms are the next F4 milestone. `npm run test:f3` verifies auth against real PostgreSQL.

F2 commands: run `npm run db:local` in one terminal, then `npm run db:migrate` and `npm run dev:f2` in another. The TypeScript/Fastify API runs on port 3100. `npm run check:f2`, `npm run build:api`, and `npm run test:f2` verify this milestone. Next.js/React and Better Auth are selected for the coming UI/auth features, not implemented yet.

Run the new, separate foundation with `npm run dev:f1` (port 3100); `npm run check:f1` checks its syntax. It currently exposes health endpoints only. The instructions below refer to the earlier feasibility prototype, whose startup remains unchanged. Production features will be implemented one milestone at a time.

A working local development foundation for a Hindi/Hinglish educational motion graphic video studio.

## Run

Requires Node.js 22 or later.

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Choose **Explore a sample workspace** to try the storyboard and motion preview without keys. Sample previews contain no generated speech and use estimated timing; they are not finished videos.

## What works

- Local account creation/sign-in and individual project ownership.
- Persistent projects, storyboard editing, autosave, stale-edit conflict rejection, and JSON export.
- Shared scene definitions for browser motion previews and CPU-rendered MP4 compositions.
- Server-side Gemini storyboard adapter and ElevenLabs narration-with-timestamps adapter.
- Audio measurement, alignment validation, phrase captions, and 1080 × 1920 H.264/AAC MP4 rendering.
- Persisted job state, duplicate active-job prevention, cancellation at stage boundaries, and restart failure reporting.
- Reuse of saved narration when retrying an unchanged project with the same voice.
- Private audio/video endpoints with ownership checks and range requests.

Live Gemini script generation and ElevenLabs timestamped narration have been exercised with account credentials. A 20.61-second Hinglish prototype was rendered locally. Voice pronunciation and educational quality still need human review.

## Reproduce the first prototype

Run `npm run prototype` after configuring `.env`. This saves the storyboard, narration, speech timestamps, timeline, and MP4 in `artifacts/first-prototype/`. It reuses saved narration on a render retry. Start with a new output folder for a different script. ElevenLabs keys need Voices: Read and Text to Speech permissions. Default account voices are preferred; a successful request confirms access, while usage consumes the account's allowance. Free-plan publishing and commercial-use terms still apply.

The prototype uses Gemini 3.1 Flash-Lite. Its first live run used the default Roger voice with Eleven Multilingual v2; this is a technical sample, and Hinglish pronunciation needs listening review.

## Connect providers

Copy `.env.example` to `.env`, then set:

- `GEMINI_API_KEY` and optionally `GEMINI_MODEL`.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and optionally `ELEVENLABS_MODEL`.

Restart the server. Create a registered account to run live requests; anonymous sample accounts cannot consume provider credits. Generated storyboards require factual review because source retrieval is not implemented. Review the script, choose a voice, and confirm it before generating narration and video.

The installed `ffmpeg-static` dependency supplies the encoder. Alternatively, set `FFMPEG_PATH` to a compatible executable with the `ass` subtitle filter and H.264/AAC support. Hindi typography depends on an installed Devanagari-capable font; the current renderer requests Nirmala UI, available on typical Windows installations. Other deployment environments need an appropriate bundled licensed font and visual verification.

No provider key is sent to browser code. Do not paste secrets into topics or narration. API calls may incur charges under your provider plan; free ElevenLabs output should not be assumed to have commercial-use rights.

## Current boundaries

This is **not the completed public V1**:

- Local JSON persistence is single-process and not a replacement for a deployed transactional database.
- Authentication is a development implementation with password hashing and HTTP-only sessions; email verification, password recovery, managed authentication, and deployment hardening remain pending.
- Instagram connection, publishing, and scheduling are not implemented; the interface states this explicitly.
- Research/source retrieval, free built-in narration, conversational revisions, a complete animation vocabulary, automatic publishing mode, and personal provider-key settings remain pending.
- The present reviewed generation path is the first pipeline slice. It does not yet provide the PRD's unattended mode.
- Job processing is single-worker FIFO. It survives browser closure, but server interruption marks in-flight jobs failed rather than automatically repeating potentially charged provider work.
- The pilot uses a simple daily cap per operation (three storyboard jobs and three video jobs by default), not the final duration-based reservation ledger, fairness policy, or platform-wide spending control. Failed attempts currently count toward the request cap. Limits reset at UTC midnight.
- This renderer is an initial FFmpeg-based feasibility implementation, not the proposed Remotion stack. Browser and export consume shared scene data; exact font rasterization and caption baseline parity still need visual tuning.
- Output checks decode the result and check basic integrity. Full automated layout checks, word-level speech completeness evaluation, provider alignment fallback, and 20-topic quality review remain pending.
- Store artifacts under `.data/`; keep the application bound to localhost for development. Cloud hosting has not been configured.

## Validation

```powershell
npm run check
npm test
```

Tests cover language/schema validation, Unicode alignment, invalid timestamps, ASS text escaping, account isolation, CSRF checks, stale revisions, persistence, logout, duplicate active jobs, and a real FFmpeg encode/decode. No live paid API call is required by tests.

## Documents

- [Product requirements](docs/PRD-V1.md)
- [Processing pipeline](docs/VIDEO-PIPELINE-V1.md)
- [Architecture and implementation status](docs/SYSTEM-ARCHITECTURE-V1.md)
- [Requirements comparison](docs/PRD-COMPARISON.md)
