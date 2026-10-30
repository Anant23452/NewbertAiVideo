# Newbert AI Video — project status and delivery backlog

Updated: 30 October 2026. Current milestone: **F1 — foundation scaffold complete for review**. Product stage: design approved; beginning feature-by-feature development. Production release: not deployed.

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
| API contract | Design prepared | [OpenAPI](api/openapi-v1.json), 40 operations; not implemented production endpoints |
| Database design | Reference schema prepared | [SQL](db/schema-v1.sql); no hosted DB/migrations applied |
| Design validation | 15 isolated checks passed | [Results](db/validation-results.json); embedded PostgreSQL, not hosted/concurrency validation |
| Provider feasibility | Live requests succeeded | Gemini script generation and ElevenLabs timestamped narration; secrets stay local |
| Video feasibility | Two local examples | Binary ~21s and psychology spotlight effect ~39s; listening/educational evaluation still required |
| Homepage UI | Approved by user | [Homepage](ui/stitch-homepage-v1.png) |
| Other UI pages | All 11 approved by user on 30 October | [Review gallery](ui/PRODUCT-DESIGN-REVIEW.html), [Stitch project](https://stitch.withgoogle.com/projects/2520368196713015322) |
| Responsive geometry | Export checks passed | [Results](ui/product/responsive-review.json); 1440/768/390/360px, no reported material overflow; not full accessibility/device testing |
| Existing local application | Feasibility prototype only | Root `server.mjs`, `public/`, `lib/`; not the production architecture |
| Production implementation | Beginning F1 | Separate scaffold; no live public service, deployed identity/DB/storage or Instagram integration |

The homepage uses black, electric violet, mint and white. Product screens cover dashboard, projects, idea/brief, storyboard, progress, preview/history, publishing, settings, sign-in, registration and recovery. Stitch exports are references, not production-ready components or functional flows.

## 3. Delivery method

For each feature: **define scope and acceptance → resolve its necessary decisions → implement → verify → review → update this tracker → start the next feature**. Work in small vertical slices. Do not build later features while their prerequisites remain unresolved. No automatic transition from design review to deployment or provider spending.

Definition of done: behavior meets the agreed contract/UI; ownership and failure states are covered where relevant; appropriate checks pass; errors and limitations are documented; no secrets are committed; this tracker records what actually works. A screenshot or placeholder is not a completed product capability.

## 4. Feature backlog

| ID | Feature / intended outcome | Depends on | Current status | Acceptance gate |
|---|---|---|---|---|
| F1 | Project tracker, separate app/module scaffold, startup/liveness | Approved design | Complete for review | Syntax and loopback HTTP smoke checks passed; readiness correctly reports dependencies missing |
| F2 | Select implementation stack and establish local DB/migration workflow | F1 | Not started | Record frontend/backend/auth choices; ordered migrations apply to disposable PostgreSQL; rollback/forward-fix strategy, config and validation documented |
| F3 | Registration, sessions, verification/recovery, private workspace bootstrap | F2 | Not started | Established auth adapter; one workspace/identity; revoke/logout; CSRF and ownership tests |
| F4 | Approved homepage and shared responsive app shell/auth UI | F2,F3 | Not started | Real components, navigation, forms, keyboard/focus, Devanagari fonts, loading/errors and narrow-width checks |
| F5 | Projects, library, draft editing and immutable submitted versions | F3,F4 | Not started | Own-project CRUD/archive; optimistic concurrency; stable versions/history; no cross-user access |
| F6 | Durable jobs, usage admission, private media and operational controls | F2,F3,F5 | Not started | Atomic reserve/job/outbox; leases/fencing; fairness; cancellation; private objects/access URLs; platform spending gates |
| F7 | Topic discussion, evidence retrieval, Gemini scripting | F5,F6 | Not started | Guided/automatic brief; stored source/claim support; no invented citations; quota/provider errors and structured input validation |
| F8 | Storyboard review, controlled visuals, voice/style selection and approval | F7 | Not started | Supported scene schema; exact-draft approval; automatic mode preserves checks without requiring manual review |
| F9 | Generated narration, pronunciation mapping and validated alignment | F6,F8 | Not started | Eligible voice/allowance; saved audio and provider identity; Hindi/Hinglish evaluation; actual timing; no blind repeat after uncertain chargeable request |
| F10 | Motion graphics, captions, rendering and validation | F9 | Not started | Application-owned components, same preview/export scene definitions; cap enforcement; two-line captions; no clipping or arbitrary model code; validated private MP4 |
| F11 | Ready-video preview/download, version history and revision reuse | F10 | Not started | Exact output/version; signed access; caption export; safe audio reuse fingerprints; last good output survives failed replacement |
| F12 | Personal speech-provider connections and usage/settings UI | F3,F6,F9 | Not started | Encrypted secret references, masked reads, permission checks, revoke/replace, no silent fallback; real used/reserved/remaining allowance |
| F13 | Official Instagram authorization and account lifecycle | F3,F6 | Not started | Developer-app requirements verified; single account; session-bound one-use OAuth state; encrypted tokens; reconnect/disconnect pauses deliveries |
| F14 | Exact-version publishing, scheduling, cancellation and reconciliation | F11,F13 | Not started | Explicit authorization; timezone validation; durable due scan; bounded late policy; no blind duplicate post on unknown outcome |
| F15 | Pilot readiness, deployment and monitored release | All release features | Not started | Security/failure/restore checks; budget-approved hosting; eval set; observability; external approvals and documented release boundaries |

F9 can initially use operator-configured narration; optional personal keys arrive in F12. F13 preparation may proceed earlier once developer-account choices are available, but publishing must not ship before its dependencies. F4/F5/F6 milestones may be subdivided into smaller reviewed changes without changing their acceptance gates.

## 5. Remaining decisions, resolved just before their feature

| Decision | Needed by | Approach |
|---|---|---|
| Frontend/backend language and framework, package layout | F2 | Record an architecture decision; do not assume the feasibility server or Stitch HTML decides the production stack |
| Supported auth adapter and transactional identity bootstrap | F2–F3 | Select with chosen framework; don't extend custom prototype password handling into production |
| PostgreSQL deployment/version and migration tooling | F2 | Design favors PostgreSQL; verify against a real disposable instance before production |
| Object storage, secret encryption/vault and email transport | F3/F6/F12 | Local adapters first; hosting selection later; no plaintext personal secrets in DB/browser |
| Research adapter and evidence policy | F7 | Verify source retrieval/cost; unsupported material claims block or require revision |
| Narration voice/model/plan rights | F9 | Evaluate Hindi/Hinglish, terms, actual account quota; no silent paid substitution |
| Renderer, fonts, license suitability and CPU budget | F10 | Benchmark controlled compositions; prototype FFmpeg is proof, not final selection |
| Daily counts, narration/render/storage units, caps, retention | F6 and before pilot | Derive from measurements; design example figures aren't production promises |
| Official Meta login flow, scopes, eligible account and app approval | F13 | Verify current official requirements using an integration test account |
| Hosting/cloud (including Azure evaluation), region and budget | F15 | Choose using measured workloads before provisioning |

## 6. Release checklist

### Foundation and data

- [ ] Choose and record implementation stack and auth approach.
- [ ] Apply reviewed migrations, roles/grants and tenant RLS to real test PostgreSQL.
- [ ] Confirm tenant isolation at API, DB and worker boundaries.
- [ ] Implement conditional draft updates and immutable generation inputs.
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
| `apps/api/`, `apps/web/`, `apps/worker/` | New F1 production-workstream scaffold |
| `packages/contracts/` | Shared contract boundary; canonical design contract remains `docs/api/openapi-v1.json` |
| `docs/` | Decisions, specs, milestone records and status |
| `artifacts/`, `.data/`, `.env` | Local runtime/prototype data and secrets; do not commit |

Verification already available: 15 isolated API/DB design checks, local video encode checks, and responsive-export geometry checks. These do not replace new production feature tests. Record each new milestone's commands/results in its document.

## 8. Change log and next action

- 30 October 2026: user approved all UI pages and requested project tracking plus a simple F1 scaffold before further features.
- F1 implementation/verification: complete for review; syntax, invalid-port validation and five HTTP smoke cases passed; see [F1 record](milestones/F1-FOUNDATION.md).
- Next after F1 review: F2 stack decision and database/migration setup. Do not provision cloud services, implement the remaining UI or start live generation under F1.
