# Newbert AI Video — V1 Product Requirements

Status: Refined V1 draft (revision 1.1); implementation has not started.
Date: 28 October 2026
Owner: Newbert AI Video

Revision basis: compared with the supplied planning excerpt on 28 October 2026. Its workflow and reliability details are incorporated below. Conflicting assumptions about product name, English-only output, fixed duration, and internal-only access are not adopted. See [comparison and decisions](PRD-COMPARISON.md).

## 1. Product purpose

Newbert AI Video helps an individual creator turn an educational topic into a narrated motion graphic video and schedule it for Instagram. The creator supplies the topic and preferences; the platform handles script creation, generated speech, visual scene planning, animation, captions, rendering, and publishing.

V1 serves many registered users. Each user has exactly one private workspace and may connect exactly one Instagram account. There are no character profiles, avatars, brand kits, or team collaboration features. A user selects a narrator voice for a project; no voice recording is required.

The intended viewing audience is Indian college students, school students, and curious learners. Creator access and third-party account eligibility are separate from the age of the viewing audience.

## 2. Confirmed product decisions

| Area | V1 decision |
| --- | --- |
| Accounts | Multiple registered users; one workspace per user |
| Instagram | At most one connected Instagram account per workspace |
| Language | Hindi and Hinglish |
| Subjects | Educational topics across psychology, philosophy, technology, and general learning |
| Narration | Automatically generated; no recording required |
| Visuals | Motion graphics that explain the narration |
| Identity | No avatars, characters, or branding tools |
| Duration | Final narration determines the video timeline |
| Infrastructure | Cloud-first; usable through a browser on an ordinary 8 GB laptop |
| Free pilot | Daily allowances and waiting queues are acceptable |
| Workflow | Optional idea discussion followed by automated production |

## 3. Goals and measures

1. A creator can produce a complete educational video without manually editing audio or animation.
2. Hindi and Hinglish narration is understandable and pronounces common technical terms correctly.
3. Visuals communicate the concept being explained rather than serving only as decoration.
4. Jobs survive worker interruptions without losing completed stages.
5. A creator can schedule a finished video for their connected Instagram account.
6. Operating costs remain visible and bounded throughout the pilot.

Initial pilot targets are hypotheses to validate, not advertised promises:

- At least 90% of supported generation jobs complete without operator repair, excluding explicitly reported external outages or exhausted user-provider quotas. Report both overall and adjusted completion rates.
- At least 80% of pilot videos are judged publishable by their creator without script or voice regeneration.
- Reviewers score explanation clarity, narration, and visual relevance separately; target an average of at least 4/5 for each.
- Caption and scene timing match the spoken content; no clipped narration or accidental silent tail.
- No duplicate Instagram posts from retries in release testing.
- Measure generation time, queue time, narration minutes, regeneration frequency, storage, and actual cost per completed video.

## 4. Scope

### Included

- Registration, login, logout, and account recovery through an established authentication service.
- One automatically created private workspace per user.
- Dashboard with projects, processing state, remaining allowance, and scheduled posts.
- Topic entry and optional discussion to improve the angle and learning objective.
- Hindi/Hinglish script generation and optional script approval/editing.
- Source records for material factual claims and review flags for unsupported claims.
- Generated narrator voice selected from supported provider voices.
- Automated scene planning, motion graphics, caption timing, and rendering.
- Video preview, download, and project history.
- One Instagram connection, scheduling, publishing status, and reconnection flow.
- Daily allowances, fair queueing, retries, cancellation, and provider usage tracking.
- Basic operator controls for failed jobs, service health, quotas, and spending limits.

### Excluded

- On-screen presenters, character generation, avatars, and voice cloning.
- Brand kits, logos, and multiple creator profiles.
- Shared workspaces, team roles, and multiple Instagram accounts per user.
- Full timeline editor or professional animation editor.
- Photorealistic text-to-video generation as a required production step.
- Training our own large language, speech, or video model.
- Other social networks, automated trend discovery, analytics-driven topic selection, and monetization/billing UI.
- Unlimited generation or guaranteed immediate processing on free infrastructure.

## 5. User journeys

### A. Guided creation

1. User enters a topic and selects Hindi or Hinglish.
2. User optionally discusses audience level, explanation angle, examples, and approximate length.
3. Platform proposes a learning objective, outline, script, and sources.
4. User can approve or edit the script and select a voice.
5. Platform generates narration, measures timing, plans scenes, creates captions, and renders.
6. User previews, downloads, or schedules the result.

### B. Automatic creation

1. User enters a topic, language, voice, and optional approximate length.
2. User starts automatic production; script approval is skipped.
3. Platform researches, writes, generates speech, creates visuals, and renders.
4. Successful output becomes ready for download or the configured publishing action.
5. Unsupported claims, blocking quality failures, or provider errors pause the affected job with a clear reason.

### C. Scheduled automatic publishing

1. User connects an eligible Instagram account through the supported authorization flow.
2. User selects a project, date, time, and timezone, or explicitly enables publish-after-generation for that project.
3. Platform records that publishing instruction and dispatches only after rendering and quality checks succeed.
4. Platform records the published media identifier and link when available.
5. Failed publishing leaves the rendered video available and offers a safe retry or reconnection action.

Recurring autonomous topic discovery is outside V1. Automatic production begins from a user-supplied topic.

## 6. Functional requirements

### FR-01: Workspace isolation

Every project, media object, credential reference, usage record, and publishing job belongs to one workspace. The server authorizes ownership on each read and write. Knowing another project's identifier must not grant access. Connecting Instagram is optional for generation and download.

### FR-02: Topic and language input

Accept topics in English, Hindi, or Hinglish, with output language explicitly selected. Collect audience level, voice, and optional approximate duration. Provide sensible defaults so users can start with a topic alone. School, college, and general-audience levels affect explanation complexity.

### FR-03: Research and scripting

Create a learning objective and coherent explanation with a hook, explanation, example where useful, and takeaway. Avoid forcing every subject into an identical narrative. Store source title, URL, retrieval time, and supported claims. Distinguish factual findings from philosophical arguments or interpretation. If evidence is unavailable, flag or revise the claim; do not invent citations. A separate AI review is a quality aid, not proof of factual correctness.

Guided mode permits script revision before speech generation. Automatic mode proceeds unless a blocking issue remains. Changing the script creates a new version and invalidates affected audio, timing, scenes, captions, and render outputs.

### FR-04: Narration

Generate speech without requiring user recordings. Offer only voices supported by the selected provider and permitted for the intended use. Test Hindi, mixed Hindi/English, numbers, abbreviations, names, and technical vocabulary. Maintain pronunciation overrides separately from display captions. Save the audio and provider request details needed for reproducibility and usage accounting.

ElevenLabs is a candidate integration, not the guaranteed free production voice provider. A supported provider and usable quota must exist before generation starts. If switching providers would change the selected voice or create charges, request a user choice rather than switching silently.

### FR-05: Duration and synchronization

Generate narration before finalizing the timeline. Use measured audio duration and sentence/word alignment to allocate scenes and captions. Do not arbitrarily truncate narration or stretch speech to fill a template. Default output duration equals narration duration; any configured opening or ending must be reflected in the displayed total.

An approximate duration is a script-writing target. A configurable maximum duration is still required for pilot resource control. If a generated result exceeds it, pause and offer shortening before rendering. Reuse unaffected work where possible and show any regeneration cost.

### FR-06: Motion graphic system

Use structured scene descriptions mapped to validated animation components. Initial components: animated typography, labelled diagrams, process flows, timelines, comparisons, icon relationships, and data charts. Cover psychology, philosophy, technology, and general education through these components.

Each scene specifies narration segment, visual purpose, component type, content, and timing. Charts must use sourced or explicitly illustrative values. Prefer a simple meaningful diagram when complex imagery is unsupported. Do not rely on arbitrary AI-generated executable code as the normal render input.

### FR-07: Captions and media output

Render vertical 9:16 MP4 with readable Hindi fonts, audio, and burned-in captions enabled by default. Proposed release target: 1080 × 1920 with H.264 video and AAC audio; validate the profile against current Instagram requirements before implementation. Retain a lower-resolution preview option. Verify actual runtime performance before committing to throughput promises. Keep critical text inside configurable platform-safe margins. Export caption text/timing as an accompanying file. Support Devanagari and Roman Hinglish captions; test both for readability.

Use at most two high-contrast caption lines at once. Resolve overlaps with important labels and diagrams. Derive readable phrases from validated audio alignment; preserve punctuation and handle numbers/acronyms intelligibly. If provider timing is missing or invalid, use a tested alignment fallback or fail the stage visibly; never fabricate apparently synchronized timestamps.

Allow caption-only display corrections, stored separately from narration. A change to spoken wording or meaning creates a narration revision and invalidates dependent timing. Proposed evaluation target: sampled phrase starts and specified animation cues within 200 ms of the intended spoken boundary; deliberate visual leads must be recorded in the scene plan. Verify this target on a representative evaluation set before making a quality claim.

### FR-08: Queue and job lifecycle

Separate project editing state, generation job state, generation stage, output validation, and publishing state. A project may have a new draft while an older immutable version is scheduled.

Generation job states: queued, running, paused, succeeded, failed, and cancelled. Stages: researching, scripting, planning_scenes, generating_voice, aligning, rendering, and checking. Publishing states: unscheduled, scheduled, publishing, published, failed, cancelled, and reconciliation_required. Paused jobs require a recorded reason such as quota, capacity, or user input; only eligible jobs resume automatically.

Show current stage, queue position or honest queue status, elapsed time, and actionable errors. Do not show fabricated progress percentages or precise completion estimates without evidence. Use fair queueing across workspaces, configurable worker concurrency, bounded retries, and stage checkpoints. Cancellation prevents subsequent stages and publishing; already incurred provider usage remains recorded.

Return a durable job identifier immediately. Deduplicate repeated submissions for the same operation and allow only one active generation/revision pipeline per project. Each job uses an immutable input snapshot. Edits during generation create a later draft. Recover abandoned worker leases; retry transient failures with backoff, but do not repeatedly retry invalid input or rejected authorization. Browser closure must not interrupt server-side work. Preserve the last valid output until a replacement passes validation.

### FR-09: Allowances and spending

Track narration minutes, rendering duration, storage, and provider credits separately. Publish the pilot allowance and maximum video duration in settings once benchmarks establish sustainable values. Reserve allowance before work, reconcile actual usage after completion, and avoid duplicate quota deductions on retries. Distinguish our allowance from third-party charges already incurred.

Enforce both per-user limits and a platform-wide daily budget/concurrency ceiling. Never enable automatic paid overages by default. When capacity is unavailable, queue or pause jobs with a clear explanation.

### FR-10: Provider connections

Design separate adapters for scripting, research, speech, rendering, and publishing. Support an operator-configured speech provider and optional user-supplied ElevenLabs credentials in V1. A built-in allowance is a product goal conditional on a sustainable provider; it is not a promise of unlimited free ElevenLabs access.

Keep V1 integrations narrow: one selected provider per required capability, plus the optional ElevenLabs connection. No broad automatic provider-routing system. Store provider/model identifiers, settings, and generated artifacts; do not assume regeneration reproduces identical output. Provider disclosure and output-use requirements apply to generated speech and exports.

Encrypt credentials at rest, keep them out of browser responses and logs, restrict permissions where supported, and allow disconnection. Additional keys from the same provider workspace do not create new credits. Never pool users' personal keys to serve other workspaces or rotate accounts to bypass provider limits.

### FR-11: Instagram connection and publishing

Use the official supported publishing API and account authorization. Confirm current professional-account eligibility, permissions, app review/access requirements, and media specifications during integration. Do not collect Instagram passwords.

Store timezone with schedules; default to the user's detected timezone and display it clearly. Publish only when the video is ready and account authorization remains valid. Detect expired authorization, validate media, check processing status, and use bounded retries respecting provider limits.

Record a unique publish intent and remote identifiers. After an ambiguous network failure, reconcile remote state before retrying; if unresolved, mark reconciliation_required instead of risking a duplicate post. A missed schedule pauses for a new time or follows an explicit, previously selected publish-when-ready policy. Do not silently publish late.

The preferred integration is official Instagram Login, subject to access validation. The operator configures the developer app and callback URLs; users connect their own destination without pasting Meta keys or passwords. Bind authorization callbacks to the initiating session with validated anti-forgery state. Show the destination identity before publishing. Allow one active workspace connection per Instagram account, rejecting conflicts without exposing another user.

Support Post now and scheduling. Save the exact asset version, post caption, destination, authorization, and unique intent before contacting Meta. Confirm media processing and publication separately; upload acceptance is not publication success. Use atomic worker claims and recovery leases. Disconnect pauses unsubmitted schedules; account replacement never redirects them automatically. Reconcile attempts already submitted before claiming cancellation succeeded.

Scheduling uses saved timezone preference, then browser timezone, then Asia/Kolkata as a visible fallback. Store UTC execution time and the originating timezone identifier; handle ambiguous/nonexistent daylight-saving times explicitly. Proposed defaults: five-minute minimum lead time and a 15-minute recoverable delivery retry window. After that window, require attention unless the user explicitly chose publish-when-ready. Continue reconciling uncertain submissions regardless of retry window. Explain that platform processing can delay visibility after scheduled dispatch.

Freeze scheduled video version, post caption, and destination. Later project edits do not modify the schedule. Offer explicit replacement only after the new version is validated and authorized. Allow rescheduling, caption changes, or cancellation until the publishing claim wins an atomic state check.

### FR-12: Project retention and deletion

Retain scripts, sources, audio, scenes, caption timings, and output versions according to a disclosed pilot retention policy. Use private media storage and short-lived access links. Deleting a project cancels pending generation and publishing and queues media removal. Deleting local records does not delete an already published Instagram post; make that behavior clear in the deletion UI.

Do not delete assets referenced by active jobs, unresolved publish attempts, or schedules. Immediately revoke creator access on deletion, then resolve in-flight work and clean up media. Keep media URLs used for Instagram ingestion valid for the required processing window. Missing/corrupt media requires regeneration as a new version; pause affected schedules until the replacement is authorized. A dedicated backup/restore product is outside V1; database disaster recovery is an infrastructure decision and must not be presented as guaranteed regeneration.

### FR-13: Storyboard and focused revisions

Use a combined script/storyboard view rather than requiring a separate script editor. Cards show stable scene ID, narration, visual intent, representative component preview, and estimated duration before audio exists. Guided approval pins the exact version. Automatic mode uses the same structure without mandatory approval screens.

Allow global or scene-specific revision requests from storyboard and preview. Initial supported edits are narration wording, pronunciation, caption display text, label size, layout, and emphasis within supported components. Requests outside supported capabilities receive an explanation and a feasible alternative. Summarize changes and preserve unaffected facts, language, topic, and audio when appropriate. Use stable scene/object identifiers so edits survive scene reordering.

Visual-only changes reuse narration and alignment. Pronunciation changes regenerate affected speech and timing. Caption display corrections preserve audio. Store artifact dependency/version metadata so stale combinations cannot render. Keep previous valid versions available; restoring one creates a new draft reference and does not silently change a schedule. A later instruction conflicting with an approved input creates a visible revision, not an in-place overwrite.

### FR-14: Autosave and preview

Autosave text after approximately one second of inactivity and display Saving, Saved, or Save failed accurately. Flush edits before generation, approval, or scheduling. Retain unsaved text locally where feasible during disconnection, without claiming server persistence. Use version checks for multiple tabs and reconnect conflicts.

Preview supports play/pause, seeking, and volume. Preview and export use the same scene data and timing. Display measured duration. Mark Ready only after file integrity, codecs, dimensions, audio presence, caption bounds, and duration checks pass. Download the exact reviewed version; a failed partial file is never offered as a completed export.

### FR-15: Authorization and automation modes

Distinguish content review from authorization to publish. In guided mode, users may approve the storyboard and finished output. In automatic mode, starting production approves the submitted inputs for generation; it does not authorize Instagram publishing by itself.

Post now or Schedule on a reviewed output authorizes that exact payload. A user may instead explicitly configure publish-after-generation for a particular input version, destination, posting preferences, and late-delivery policy. Record that instruction before generation. Automated output may publish only if it derives from those inputs and passes all blocking checks. No additional manual review is mandatory for that authorized automatic path. Material user revisions invalidate the previous publishing authorization for the revised output.

## 7. System design direction

Browser application → authenticated application service → database and durable job queue → stage-specific workers → private media storage → scheduling/publishing worker.

- The browser is a control surface, not a required rendering machine.
- Workers save results between stages and can resume after interruptions.
- CPU-based motion graphic rendering is the default candidate; GPU inference is used only where a chosen model benefits from it.
- Shared free GPU services are optional pilot resources, subject to their terms, quotas, and account requirements.
- Google Colab and Kaggle are useful evaluation environments, not assumed always-on production services.
- Rendering, speech, storage, and scheduling are separate workloads; free website hosting does not cover their costs automatically.
- Choose the concrete hosting provider after benchmarking and eligibility checks. No deployment provider is selected by this PRD.

Candidate tools include a web application framework, a durable database-backed queue, Remotion or an equivalent animation renderer, FFmpeg for media assembly, and a speech provider adapter. These are implementation candidates, not committed dependencies.

The supplied reference proposes Next.js, Gemini, ElevenLabs, Remotion, Better Auth, MongoDB, Cloudflare R2, Inngest, and Vercel Sandbox. Treat this as a candidate implementation stack, not an approved free hosting guarantee. Benchmark runtime support, timeout behavior, authentication compatibility, costs, and media transfer before adopting it. A separate Express application is not required merely to run background work. Workflow orchestration does not supply rendering compute by itself.

Minimum logical records: User, Workspace, Project, ProjectVersion, Scene, Artifact, GenerationJob, UsageReservation, ProviderConnection, InstagramConnection, PublishIntent, and Schedule. These may be embedded or separate records depending on the chosen database. Use owner indexes, unique operation keys, and atomic claims. Store binary media in private object storage, with references in the database. Workers derive ownership from stored records rather than trusting event payload owner fields.

Each scene includes stable identifiers; learning purpose; a supported component type; narration and pronunciation preferences; visual objects and layout; animation events mapped to narration spans; source references; estimated and measured timing; and caption references. Validate schema, object references, text limits, and monotonic timestamps. Isolate render workers and restrict file/network access to controlled dependencies and assets.

## 8. Quality, privacy, and operational requirements

- Validate structured scene data and bound resource use before rendering.
- Check audio presence, duration, caption bounds, missing assets, text overflow, and render validity automatically.
- Maintain user ownership checks for all media and publish operations.
- Redact secrets from telemetry and use request/job identifiers for diagnostics.
- Provide accessible forms, clear empty states, keyboard navigation, and readable error messages.
- Track provider failures, queue saturation, spending, and publishing outcomes.
- Keep licensed assets and voice usage conditions with the project when relevant.
- Record when and how a user authorized a scheduled or automatic publishing action.
- Use keyboard-accessible controls, labelled inputs, visible focus states, and restrained job announcements.
- Test text and diagram readability on real phone-sized output; avoid rapid flashing.
- Optimize authoring for desktop while keeping mobile review and download usable.
- Log project/version/job identifiers, stage durations, save conflicts, revisions, validations, and publishing outcomes without raw prompts or secrets by default. No separate analytics or billing dashboard is required for V1.

## 9. Release acceptance criteria

V1 is ready for a limited external pilot only when:

1. Two users can create and operate workspaces without accessing each other's projects, files, credentials, or publishing jobs.
2. Each workspace cannot connect a second Instagram account; replacing a connection explicitly handles pending schedules.
3. Topic-to-video completes with generated narration and no mandatory recording or timeline editing.
4. At least one Hindi and one Hinglish project in each initial subject group pass human review for clarity, pronunciation, visual relevance, and readability.
5. Multiple narration lengths produce matching video timelines without clipped speech or unexplained tails.
6. Changing a script regenerates dependent outputs and never renders stale captions/audio together.
7. Quota exhaustion, unavailable GPU, expired credentials, worker restart, and provider timeout produce recoverable states.
8. A rendering retry reuses completed narration and does not duplicate our quota charge.
9. Instagram connection, scheduled publishing, expired-token recovery, ambiguous-response reconciliation, and duplicate prevention are verified against supported test/live-account paths.
10. No unintended publishing occurs from a draft, failed job, cancelled schedule, or disconnected account.
11. Operator budget limits halt new chargeable work and leave queued work visible.
12. Export remains available when Instagram is disconnected or publishing fails.
13. Double-clicks, refreshes, and browser closure do not duplicate generation jobs; multi-tab saves do not silently overwrite newer drafts.
14. A visual-only revision preserves speech; caption display corrections preserve audio; speech revisions invalidate dependent alignment and scenes.
15. An older approved or scheduled version survives failed regeneration. Revised projects do not alter existing schedule payloads.
16. Caption phrases use at most two readable lines and avoid important labels; missing alignment blocks Ready until recovered.
17. Account conflicts, authorization callback forgery, disconnected accounts, scheduling races, timezone conversion, and uncertain external publication are covered by focused tests.
18. Both reviewed publishing and explicitly authorized publish-after-generation work without adding mandatory approval screens to automatic mode.

Evaluation set: at least 20 topics covering processes, comparisons, timelines, abstract ideas, charts, psychology, philosophy, and technology. Include Hindi and Hinglish, Indian names, technical terms, acronyms, numbers, units, broad requests, contradictory instructions, missing evidence, and overlong scripts. Evaluate at least three supported narration lengths within the selected pilot cap; do not impose a fixed 60–90-second requirement.

Verification combines unit checks for timing/schema/version rules, workflow and ownership integration tests, bounded live-provider checks, failure/retry tests, and human visual/listening review. Passing schema checks alone does not demonstrate educational quality.

## 10. Delivery sequence

### Milestone 1 — Feasibility proof

Generate sample Hindi/Hinglish narration and one complete motion graphic video; benchmark multiple lengths and subject types. Compare voice quality, CPU/GPU requirements, latency, licensing conditions, and cost. Select sustainable provider and hosting candidates. This is an internal proof, not the full V1 release.

### Milestone 2 — Multi-user creation pilot

Deliver authentication, private workspaces, guided/automatic generation, durable queue, allowances, preview, and download. Add recovery and cost controls before inviting external users.

### Milestone 3 — Publishing and V1 release

Complete Instagram authorization and any required provider approval, scheduling, publishing, reconciliation, and operational checks. If external access approval is pending, label the release as a generation pilot; do not claim full V1 publishing is delivered.

## 11. Decisions to resolve during feasibility work

These do not require more product clarification before starting the technical proof:

- Best sustainable Hindi/Hinglish speech provider and suitable stock voices.
- Whether an operator-funded free allowance is viable alongside optional personal keys.
- Daily narration allowance, maximum video duration, retention, and queue concurrency.
- Script/research provider, retrieval cost, and handling of claims without evidence.
- Rendering throughput and memory at target resolution.
- Cloud services with compatible runtime, durable scheduling, storage, and acceptable terms.
- Current Instagram integration requirements and the approval path for external users.

## 12. Risks and responses

| Risk | Response |
| --- | --- |
| Free computing unavailable | Queue transparently, checkpoint stages, and provide capacity controls |
| Free allowances do not cover many users | Limit pilot admission and usage; benchmark before expanding |
| Hindi model performs poorly on Hinglish | Use representative listening tests and pronunciation overrides |
| Graphics are generic or confusing | Evaluate scene relevance; improve reusable explanatory components |
| Unsupported educational claims | Preserve sources, flag uncertainty, and pause unresolved material claims |
| Long videos consume excess resources | Enforce disclosed duration caps and duration-based allowances |
| Publishing approval or account problems | Start integration early; retain export and clearly report incomplete access |
| Provider terms change | Keep adapters replaceable and recheck terms before release |

## 13. Market hypothesis and expansion

The hypothesis is that Indian educational creators value a Hindi/Hinglish workflow that connects explanation planning, generated narration, meaningful motion graphics, and publishing. Competitor features establish an existing category; they do not prove demand for Newbert.

Validate through a small creator pilot, repeated use, publishability ratings, observed production time, and willingness to pay. Future options include paid usage allowances, additional languages, and more advanced scene systems. Revenue assumptions and market-size estimates remain unvalidated and are not V1 acceptance criteria.

## 14. Reference notes

Provider capabilities and terms must be checked again at implementation and release. References reviewed during planning:

- ElevenLabs API keys: https://elevenlabs.io/docs/overview/administration/workspaces/api-keys — keys track usage against workspace quota and must remain secret.
- ElevenLabs billing: https://elevenlabs.io/docs/overview/administration/billing — free output is non-commercial with attribution; paid plans have commercial-use provisions.
- ElevenLabs account limits: https://elevenlabs.io/docs/help-center/account/general/can-users-have-more-than-one-account — free-account restrictions apply.
- Google Colab FAQ: https://research.google.com/colaboratory/faq.html — resources and sessions are limited; restrictions affect unattended external-service use.
- Kaggle GPU usage: https://www.kaggle.com/docs/efficient-gpu-usage — notebook GPU access has quotas and availability limits.
- Hugging Face ZeroGPU: https://huggingface.co/docs/hub/main/spaces-zerogpu — shared GPU hosting and per-user quotas have eligibility and framework restrictions.
- AI4Bharat IndicF5: https://huggingface.co/ai4bharat/IndicF5 — candidate Hindi speech model; Hinglish quality requires testing.
- Remotion: https://www.remotion.dev/ — candidate programmatic animation renderer; evaluate current license eligibility.
- Meta Instagram API collection: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api — publishing capabilities and account requirements; confirm the chosen login flow against official implementation documentation.
- Meta implementation documentation: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login — direct retrieval was rate-limited during this drafting session; implementation requirements remain a verification gate.
