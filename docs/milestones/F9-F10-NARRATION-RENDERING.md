# F9/F10 — narration and motion rendering

Delivered for local review, 30 October 2026. Next milestone: F11 output history, download and revision workflows. No cloud deployment or Instagram publishing.

## Working pipeline

An exact approved storyboard enters the durable produce queue after explicit speech-credit and output-use acknowledgement. Guided mode requires current approval; automatic mode still enforces evidence and content checks. Admission atomically reserves generation, speech characters, narration duration and rendering duration. A saved draft change requires a fresh approval.

The restricted worker checks renderer/font availability and free-plan voice eligibility before speech. It submits the selected ElevenLabs voice and multilingual model to the timestamped endpoint with fixed settings. A durable attempt is recorded before the request. Provider identity, spoken text and pronunciation mapping form a workspace-scoped reuse fingerprint. Unknown chargeable outcomes pause for reconciliation rather than silently resubmitting.

Successful audio is checkpointed, decoded and measured. Raw provider characters must match the exact spoken manifest with monotonic timestamps; missing or ambiguous alignment pauses. Pronunciation overrides change spoken phrases while preserving displayed text. The original provider response is bounded and its audio payload is removed after both private audio and alignment artifacts are saved. Failed checkpoints need a future retention policy before hosted release.

Measured narration drives scene boundaries, word cues and captions. Shared controlled operations describe typography, diagrams, flows, timelines, comparisons, relationships and steps. The browser SVG preview follows actual audio playback; FFmpeg/libass exports those same operation definitions as animated shapes/text and two-line captions. No generated code is executed. SVG and libass rasterization can differ; this is a shared composition model, not pixel-identical rendering.

The encoder creates a private 720×1280, 24fps H.264/AAC MP4 using two CPU threads. Audio is never shortened to fit a target. At most one video-frame tail is padded. Validation decodes the entire file and checks audio, codecs, dimensions, duration and output size before Ready. Output, caption VTT, composition and validation report have recorded dependencies. A failed replacement preserves the last good project output.

## Pilot limits and operation

- Maximum spoken text: 1,600 characters; measured narration cap: 120 seconds. Overlong audio is saved and paused without trimming.
- Daily speech allowance: 2,000 characters per workspace / 4,000 global; maximum two new speech calls per workspace / four global.
- Daily narration and rendering allowances, separately: 240 seconds per workspace / 600 seconds global. Incurred provider/render work remains charged; unused reservations are released.
- Default private storage: 50 MiB per workspace / 500 MiB global. Custom operator limits are preserved by migration.
- Up to six visual objects per scene; conservative text bounds reject overflow before speech. Caption groups have at most six words and two lines. Nonempty caption overrides are explicitly deferred to F11.
- Free-plan speech only: insufficient quota, paid tier, missing access or changed credentials pauses; there is no paid fallback. The UI requires acknowledgement of noncommercial use and attribution.

Run npm run db:migrate and build the API/web, then start the API, worker and web separately. Existing ignored root .env supplies named ElevenLabs key/model/voice settings; server environment values take precedence. SPEECH_ENABLED=false disables speech. npm run speech:preflight checks eligibility without generating audio. Never paste credentials into project documents.

Windows rendering requires C:/Windows/Fonts/Nirmala.ttc. Other systems require an installed Devanagari-capable font and DEVANAGARI_FONT_READY=true. FFmpeg defaults to ffmpeg-static; FFMPEG_PATH can select a compatible executable with libass. Render work directories are private, per fenced job and cleaned after completion.

Render retries require verified audio/alignment hashes in the same workspace. They reserve new rendering time but do not purchase speech again. Changed spoken text, voice, model or credential identity invalidates reuse. Cancellation and lease loss preserve accounting and prevent stale publication. An uncertain speech attempt blocks another identical request in that workspace pending reconciliation.

Commit review, 31 October: the worker rechecks unresolved identical speech under the submission lock, including jobs admitted before another request became uncertain. New-speech authorization is persisted with the job's reservation decision; if narration reserved for reuse disappears, the worker pauses instead of buying speech with no new-speech reservation. The new storage migration upgrades only the previous defaults and preserves custom operator ceilings.

## Verification

- All fourteen F9/F10 cases passed together using isolated PostgreSQL, deterministic speech adapters and the real encoder. Review coverage includes already-queued duplicate speech, disappearing reuse-only narration, and preservation of custom storage ceilings.
- Thirty-eight regression cases passed: F7 planning 9, F6 queue 15, F5 projects 7, F2 database 7. Total: 52 automated cases.
- Ten connected browser checks passed with mocked speech and real private video. Signed playback, approval, timed preview, anonymous access denial and 1440/768/390/360px layouts are covered. Evidence: docs/ui/f9-f10/validation-results.json.
- Backend and web type checks/builds passed. Fourteen migrations are applied; 34 domain tables.
- One explicitly bounded real provider smoke used 38 included free characters. Actual narration: 2.32 seconds; measured validated video: 2.33 seconds. Evidence: docs/db/f9-live-smoke.json. The opt-in tests/f9/live-smoke.ts consumes credits; do not include it in routine regression runs.

Representative Hindi/Hinglish listening, educational accuracy, 20-topic quality review, long-duration concurrency/device performance, accessibility, hosted font packaging, storage retention and public-release operations remain release gates. The short live sample establishes connectivity and rendering, not broad voice quality. Personal provider connections remain F12; Instagram authorization and publishing remain F13/F14.
