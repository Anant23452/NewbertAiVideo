# Newbert AI Video — project status and delivery backlog

Updated: 1 November 2026. Current focus: **core topic-to-video workflow; Instagram deferred until generation is working for the user**. Product stage: feature-by-feature development. Production release: not deployed.

This is the main project tracker. Keep it current after each feature. Completed design/prototype work is not evidence that the production feature is implemented.

## 1. Confirmed product scope

- Many registered creators; one private workspace and at most one Instagram account per user.
- Educational explanations for Indian school/college students and curious learners; subjects can vary.
- Hindi and Hinglish first; automatically generated narration, no recording or avatar required.
- Meaningful motion graphics, readable captions, narration-driven duration within a disclosed resource cap.
- Optional idea discussion; guided script review or automatic production with quality checks.
- Preview/download, version history, safe revisions, and eventual authorized Instagram scheduling.
- Limited free pilot, transparent allowances, fair waiting queue and bounded operating costs.
- No teams, brand kits, cloning, multiple Instagram accounts, pro timeline editor, billing UI or autonomous topic discovery in V1.

## 2. Completed work and evidence

| Area | Status | Evidence / qualification |
|---|---|---|
| Product requirements | Working baseline | [PRD V1](PRD-V1.md); refine only through recorded scope decisions |
| Processing pipeline | Reviewed baseline | [Video pipeline](VIDEO-PIPELINE-V1.md) |
| System architecture | Reviewed baseline | [System design](SYSTEM-DESIGN-V1.md); modular backend, PostgreSQL proposal, private media and separate workers |
| API contract | Design prepared | [OpenAPI](api/openapi-v1.json), design operations plus production status; implemented F3–F12 subset in milestone/API handoffs |
| Database design | Reference promoted to local versioned migrations | [SQL reference](db/schema-v1.sql), [migration workflow](../packages/database/README.md); 34 current domain tables on local PostgreSQL, no hosted DB |
| Design validation | 15 isolated checks passed | [Results](db/validation-results.json); embedded PostgreSQL, not hosted/concurrency validation |
| Provider feasibility | Live requests succeeded | Gemini script generation and ElevenLabs timestamped narration; secrets stay local |
| Video feasibility | Two local examples | Binary ~21s and psychology spotlight effect ~39s; listening/educational evaluation still required |
| Homepage UI | Approved by user | [Homepage](ui/stitch-homepage-v1.png) |
| Other UI pages | All 11 approved by user on 30 October | [Review gallery](ui/PRODUCT-DESIGN-REVIEW.html), [Stitch project](https://stitch.withgoogle.com/projects/2520368196713015322) |
| Responsive geometry | Export checks passed | [Results](ui/product/responsive-review.json); 1440/768/390/360px, no reported material overflow; not full accessibility/device testing |
| Existing local application | Feasibility prototype only | Root `server.mjs`, `public/`, `lib/`; not the production architecture |
| Production implementation | F1–F11 foundations, projects, planning and media pipeline complete for local review | TypeScript/Fastify, local PostgreSQL, auth and own-workspace endpoints; real projects/version history, durable worker, usage and private local media; bounded planning/discussion handlers and reviewed storyboard approval; bounded narration and validated private motion rendering; external email delivery and Instagram integration remain pending |

The homepage uses black, electric violet, mint and white. Product screens cover dashboard, projects, idea/brief, storyboard, progress, preview/history, publishing, settings, sign-in, registration and recovery. Stitch exports are references, not production-ready components or functional flows.

## 3. Delivery method

For each feature: **define scope and acceptance → resolve its necessary decisions → implement → verify → review → update this tracker → start the next feature**. Work in small vertical slices. Do not build later features while their prerequisites remain unresolved. No automatic transition from design review to deployment or provider spending.

Definition of done: behavior meets the agreed contract/UI; ownership and failure states are covered where relevant; appropriate checks pass; errors and limitations are documented; no secrets are committed; this tracker records what actually works. A screenshot or placeholder is not a completed product capability.

## 4. Feature backlog

| ID | Feature / intended outcome | Depends on | Current status | Acceptance gate |
|---|---|---|---|---|
| F1 | Project tracker, separate app/module scaffold, startup/liveness | Approved design | Complete for review | Syntax and loopback HTTP smoke checks passed; readiness correctly reports dependencies missing |
| F2 | Select implementation stack and establish local DB/migration workflow | F1 | Complete for review | Stack ADR, typed API build, local PostgreSQL, two migrations and six real-server tests; 23 existing tests pass |
| F3 | Registration, sessions, verification/recovery, private workspace bootstrap | F2 | Complete for review | Better Auth + isolated auth schema/role; transactional workspace bootstrap; 15 real-server auth cases and SMTP configuration regression passed; SMTP external delivery remains release configuration |
| F4 | Approved homepage and shared responsive app shell/auth UI | F2,F3 | Complete for review | Next.js/React components, real identity and timezone/password forms, 13 live-browser checks and return-path security test; 1440/768/390/360px geometry; see F4 record |
| F5 | Projects, library, draft editing and immutable submitted versions | F3,F4 | Complete for review | 7 real-DB cases and connected browser workflow; owner-scoped create/search/archive/restore, conflict-aware drafts and immutable snapshots |
| F6 | Durable jobs, usage admission, private media and operational controls | F2,F3,F5 | Complete for review — local foundation | 14 real-DB cases; atomic admission, restricted worker, fairness/leases/fencing, bounded recovery, cancellation/retry, quotas, signed private media and operator controls; stage handlers remain F7–F10 |
| F7 | Topic discussion, evidence retrieval, Gemini scripting | F5,F6 | Complete for local review | Queued discussion/planning; retrieved excerpts and claim provenance; bounded Gemini adapter; provider error/uncertainty and call caps; live AI account output evaluation still a release gate |
| F8 | Storyboard review, controlled visuals, voice/style selection and approval | F7 | Complete for local review | Controlled editable scenes, voice/style choice, evidence review and immutable approved snapshot; automatic application only without unresolved factual flags; narration edits require fresh evidence |
| F9 | Generated narration, pronunciation mapping and validated alignment | F6,F8 | Complete for local review | Eligible voice/allowance; saved audio and provider identity; Hindi/Hinglish evaluation; actual timing; no blind repeat after uncertain chargeable request |
| F10 | Motion graphics, captions, rendering and validation | F9 | Complete for local review | Application-owned components, same preview/export scene definitions; cap enforcement; two-line captions; no clipping or arbitrary model code; validated private MP4 |
| F11 | Ready-video preview/download, version history and revision reuse | F10 | Complete for local review | Exact output/version; signed access; caption export; safe audio reuse fingerprints; last good output survives failed replacement |
| F12 | Platform-generated voice status and usage/settings UI | F3,F6,F9 | Complete for local review — scope revised by user | Configured voice needs no recording/key setup; real used/reserved/remaining allowance, UTC reset, recent usage and honest capacity/error states |
| F13 | Official Instagram authorization and account lifecycle | F3,F6 | Local implementation; live acceptance pending | Developer-app requirements verified; single account; session-bound one-use OAuth state; encrypted tokens; reconnect/disconnect pauses deliveries |
| F14 | Exact-version publishing, scheduling, cancellation and reconciliation | F11,F13 | Not started | Explicit authorization; timezone validation; durable due scan; bounded late policy; no blind duplicate post on unknown outcome |
| F15 | Pilot readiness, deployment and monitored release | All release features | Not started | Security/failure/restore checks; budget-approved hosting; eval set; observability; external approvals and documented release boundaries |

Operator-configured narration remains the V1 approach. On 31 October the user narrowed F12 to usage/settings; optional personal keys are deferred. F13 preparation may proceed earlier once developer-account choices are available, but publishing must not ship before its dependencies. F4/F5/F6 milestones may be subdivided into smaller reviewed changes without changing their acceptance gates.

## 5. Remaining decisions, resolved just before their feature

| Decision | Needed by | Approach |
|---|---|---|
| Frontend/backend language and framework, package layout | F2 — selected | [ADR 001](decisions/ADR-001-IMPLEMENTATION-STACK.md): strict TypeScript, Next.js/React, Fastify, npm/root lockfile; actual frontend implementation F4 |
| Supported auth adapter and transactional identity bootstrap | F3 backend complete | [ADR 002](decisions/ADR-002-IDENTITY-WORKSPACE.md): Better Auth, private auth tables, atomic bootstrap, local mail + configurable SMTP; real external mail/production settings remain release tasks |
| PostgreSQL deployment/version and migration tooling | F2 local complete / hosting later | Native PostgreSQL 17 locally; pg + node-pg-migrate; actual migration replay/rollback and role tests pass |
| Object storage, secret encryption/vault and email transport | F3/F6/F12 | Local adapters first; hosting selection later; no plaintext personal secrets in DB/browser |
| Research adapter and evidence policy | F7 | Verify source retrieval/cost; unsupported material claims block or require revision |
| Narration voice/model/plan rights | F9 | Evaluate Hindi/Hinglish, terms, actual account quota; no silent paid substitution |
| Renderer, fonts, license suitability and CPU budget | F10 | Benchmark controlled compositions; prototype FFmpeg is proof, not final selection |
| Daily counts, narration/render/storage units, caps, retention | F6 local defaults / before pilot | Local conservative counts and byte limits in ADR 003; paid providers disabled; measured narration/render budgets and complete retention remain stage/release work |
| Official Meta login flow, scopes, eligible account and app approval | F13 | Verify current official requirements using an integration test account |
| Hosting/cloud (including Azure evaluation), region and budget | F15 | Choose using measured workloads before provisioning |

## 6. Release checklist

### Foundation and data

- [x] Choose and record implementation stack and auth approach; implementation of auth remains F3.
- [x] Apply reviewed migrations, roles/grants and tenant RLS to real local/test PostgreSQL; hosted deployment remains F15.
- [ ] Confirm tenant isolation at all feature boundaries; F3 auth/own-workspace and DB cases pass, future project/worker features still require their own checks.
- [x] Implement conditional draft updates and immutable submitted inputs (F5/F6).
- [ ] Configure secrets, private object access, retention holds, backup and restore ownership.

### Content and generation

- [ ] Research/claim support, interpretation and illustrative-data flags.
- [ ] Guided review and automatic path with blocking checks.
- [ ] Voice eligibility/terms, pronunciation settings and Unicode span mappings.
- [ ] Valid monotonic alignment and complete narration coverage.
- [ ] Duration caps, frame rounding, legible captions and controlled diagrams.
- [ ] Retry without duplicate platform debit or unnecessary voice generation.
- [ ] Crash recovery, stale-worker rejection, cancellation and provider uncertainty.
- [ ] Fair admission and per-workspace/global cost/concurrency circuit breakers.

### UX and publishing

- [ ] Implement the approved screens with real data and honest empty/error/loading states.
- [ ] Keyboard/focus, screen labels, contrast, mobile touch and Hindi typography review.
- [ ] Exact-version preview/download and caption-only vs spoken-text revision behavior.
- [ ] Single Instagram account, secure OAuth and token renewal/disconnection.
- [ ] Explicit posting consent, timezone/late policy and stable schedule payloads.
- [ ] Remote-result reconciliation; uncertain submission cannot become a duplicate post.

### Pilot quality and operations

- [ ] Evaluate at least 20 representative topics across subjects, languages and lengths per PRD.
- [ ] Score explanation clarity, voice and visual relevance separately; don't infer these from schema checks.
- [ ] Verify representative caption/cue timing, no clipped ending and readable safe areas.
- [ ] Exercise concurrency and fault cases from [API/DB review](API-DB-REVIEW-V1.md).
- [ ] Redact secrets/content in logs; measure queue/stage time, usage, unknown outcomes and orphaned media.
- [ ] Validate spend limits, retention, cleanup races and backup restoration before pilot.
- [ ] Distinguish generation pilot from full V1 if Instagram approval is pending.

## 7. Code boundaries and verification record

| Location | Role |
|---|---|
| Root `server.mjs`, `lib/`, `public/`, `tests/` | Existing feasibility prototype; current root `npm run dev` behavior preserved |
| `apps/api/`, `apps/web/`, `apps/worker/` | Typed API alongside retained F1 entry; Next.js web UI; separate restricted durable worker |
| `packages/contracts/` | Shared contract boundary; canonical design contract remains `docs/api/openapi-v1.json` |
| `packages/database/`, `scripts/db/` | Versioned SQL, typed pg helper, local PostgreSQL lifecycle and migration CLI |
| `docs/` | Decisions, specs, milestone records and status |
| `artifacts/`, `.data/`, `.env` | Local runtime/prototype data and secrets; do not commit |

Verification already available: 15 isolated API/DB design checks, local video encode checks, and responsive-export geometry checks. These do not replace new production feature tests. Record each new milestone's commands/results in its document.

F2: six real-PostgreSQL integration tests plus all 23 existing F1/prototype tests passed; backend typecheck/build pass. See [results](db/f2-validation-results.json). Runtime DB role has tenant read access only; auth/feature-specific writes and production grants remain future work.

F3: 15 identity integration tests and one SMTP configuration test, 7 current F2 tests (including request-error QA), and 23 F1/prototype regressions passed; 46 total. [Results](db/f3-validation-results.json). Tenant runtime now has limited timezone/revision writes; the separate identity service has only its auth-table and resolver access. Production grants and future project/worker writes are still not implemented.

## 8. Change log and next action

- 30 October 2026: user approved all UI pages and requested project tracking plus a simple F1 scaffold before further features.
- F1 implementation/verification: complete for review; syntax, invalid-port validation and five HTTP smoke cases passed; see [F1 record](milestones/F1-FOUNDATION.md).
- 30 October 2026: F2 completed for review. [Stack decision](decisions/ADR-001-IMPLEMENTATION-STACK.md), [F2 record](milestones/F2-STACK-DATABASE.md), and [local database guide](../packages/database/README.md) added. Local migrations applied twice (second run: zero work); no cloud or paid API calls.
- 30 October 2026: F3 backend complete for review. [Milestone record](milestones/F3-IDENTITY-WORKSPACE.md), [identity ADR](decisions/ADR-002-IDENTITY-WORKSPACE.md), and [API handoff](api/IDENTITY-F3.md) added. No external emails, paid provider requests, cloud resources or UI implementation.
- 30 October 2026: F4 complete for review. [Milestone record](milestones/F4-WEB-AUTH.md), [browser results](ui/f4/validation-results.json), responsive screenshots and repeatable tests added. Web on 127.0.0.1:3001; API on 3100; private local PostgreSQL. No cloud deployment, paid generation or external email.
- 30 October 2026: F5 and F6 delivered together at user request. [F5 projects](milestones/F5-PROJECTS.md), [F6 processing](milestones/F6-PROCESSING.md), [ADR 003](decisions/ADR-003-DURABLE-PROCESSING.md), [API handoff](api/PROJECTS-PROCESSING-F5-F6.md). Seven migrations, 30 newbert tables plus private auth tables; no cloud or paid calls.
- Validation: 68 automated tests across existing and F2–F6 suites, plus 24 live-browser checks (13 account + 11 project/processing). Production builds and type checks pass; dependency audit reports zero known runtime vulnerabilities. See [combined record](db/f5-f6-validation-results.json). F4 independent QA observations remain recorded separately; this is not a complete accessibility/public-release sign-off.
- 30 October 2026: F7/F8 delivered. [Scope and validation](milestones/F7-F8-PLANNING-STORYBOARD.md): optional queued discussion, retrieved Wikipedia excerpts, bounded Gemini scripting, controlled storyboard editing, voice/style preferences and immutable approved versions. Four forward migrations applied. Nine integration/adapter checks, seven browser checks and 29 project/queue/migration regressions passed; builds/type checks pass. No live AI/speech requests in testing.
- F9/F10 delivered: [implementation and limits](milestones/F9-F10-NARRATION-RENDERING.md). Fourteen applied migrations, 34 domain tables. Next after review: F11 preview/history and revision workflows. Live account output evaluation and educational-quality gates remain required before pilot; source matching is not semantic fact verification.

- F9/F10 verification: 52 automated cases and 10 connected browser checks passed after commit review; backend/web builds passed. Earlier delivery verification included OpenAPI validation, a 38-character free-tier sample, and local readiness/login checks. Commit review used mocked providers and fixed duplicate speech, reuse-only authorization and custom storage limits. [Verification record](db/f9-f10-validation-results.json). Free speech output requires noncommercial use and attribution; broader Hindi/Hinglish listening and educational evaluation remain pilot gates.

- 31 October 2026: F11 delivered for local review. [Output history and revisions](milestones/F11-OUTPUT-HISTORY-REVISIONS.md): exact-version playback, private MP4/VTT downloads, paginated saved outputs, conflict-aware snapshot restoration and bounded caption presentation corrections. Last good output survives failed replacement; verified narration reuse avoids new speech. No migration or live API-credit spending. Next after review: F12 personal provider connections and settings.
- F11 verification: 18 integration/regression cases and 16 connected browser checks passed; API/web builds, OpenAPI validation, live readiness, dummy login and history endpoints passed. [Results](db/f11-validation-results.json). Local app is running on port 3001.

- 31 October 2026: user accepted a narrower F12: platform-configured generated voice plus usage/allowance settings. Personal keys and encrypted provider-connection management are deferred, not implemented. [Delivery record](milestones/F12-USAGE-SETTINGS.md). Seven allowance cards, current-policy limit reporting, speech-request counts, paginated usage and refreshed configuration/pause states. No recording, live provider requests, new migration or cloud deployment. Next: F13 Instagram authorization.
- F12 verification: 19 integration/accounting cases and eight browser checks passed; backend/web builds, type checks, OpenAPI validation and live local readiness/login/settings endpoints passed. [Results](db/f12-validation-results.json). Local app remains running at port 3001. No live provider calls or credit spending.

- 1 November 2026: [F13 connection lifecycle](milestones/F13-INSTAGRAM-CONNECTION.md) implemented locally: scoped sign-in, one-use session/generation-bound state, encrypted token references, single destination, renewal, disconnect and paused deliveries. No live Meta credentials or account authorization. Saved website policy still blocks Meta browser access; no workaround attempted. F13 is not a completed live account connection.
- F13 verification: 11 mocked-provider integration cases, seven database regression cases and seven browser checks passed. Fifteenth migration applied locally, 35 domain tables. API build, web type check and OpenAPI validation passed. Local readiness/login pass; live status correctly reports connected=false and configured=false. [Verification](db/f13-validation-results.json). No real Meta requests or posts.

- 1 November 2026: user deferred Instagram and prioritized topic → Gemini narration/storyboard → ElevenLabs voice → captions → local FFmpeg rendering. Diagnosed the real paused project as EVIDENCE_UNAVAILABLE for “Dopamin Detox how to do”. Added one bounded filler-word-cleaned keyword-prefix search retry, preserving retrieved source validation; tightened Gemini instructions to write complete narration within the pilot budget. All 10 planning tests and API build passed. Resumed the paused job: live Gemini produced three Hinglish scenes successfully. Result is saved for review; automated draft replacement was rejected by approval review, so no draft overwrite, speech purchase or new video render occurred in this repair.
