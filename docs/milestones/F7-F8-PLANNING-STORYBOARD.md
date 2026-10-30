# F7/F8 — Research-backed planning and storyboard review

30 October 2026. Complete for local review. No public deployment.

## Delivered workflow

1. Create/save a project brief. Optionally ask an idea question in the project discussion panel.
2. Submit the saved brief. The restricted worker retrieves source introductions, calls the configured Gemini model once, validates its JSON and controlled scenes, and stores a private storyboard and evidence records.
3. Open **Storyboard review**, refresh after processing, and choose **Use generated storyboard**. A changed brief or stale draft revision blocks importing old output.
4. Review narration, component choices, labels and sources; select the configured voice and visual style. Save before approval.
5. Acknowledge source checks and voice terms, then approve the exact revision. Approval creates an immutable version with its actor, hash and evidence lineage. Editing the draft invalidates the current approval without changing the approved version.

Discussion messages and replies are stored privately. Each message queues a separately admitted ideation job; it does not hold open an HTTP request or run Gemini in the web server. Only a worker can write the assistant response. Discussion is creative guidance, not sourced factual content.

## Evidence policy

Source retrieval uses the fixed English/Hindi Wikipedia API, introductory plaintext excerpts, at most three articles and 2,500 characters per excerpt. URLs, titles, retrieval time, content hashes and excerpts are saved. Model-created URLs are never accepted as evidence. Claims can refer only to retrieved source indexes and exact excerpt quotations.

Matching a quotation establishes provenance, not semantic truth or entailment. Factual paraphrases remain `needs_review`; missing/mismatching support becomes `unsupported`. Unsupported facts block approval. Reviewed claim IDs must belong to the exact storyboard. Source attribution and links are shown in the UI. This is a limited initial research adapter, not a multi-source or expert fact-checking system.

Automatic mode retains the same checks. Nonblocking plans can apply themselves only when the original draft is unchanged, the lease is current, and no factual review flag remains unresolved. Factual plans currently stop for review rather than silently certifying themselves. Automatic application is not consent to synthesize a voice, publish content or spend without bounds. Voice consent remains explicit before an approved snapshot is created.

Narration edits require a new evidence plan before approval. Visual-only changes are editable; arbitrary executable parameters, unsupported chart data, duplicate scene/object IDs and invalid Unicode cue/mapping spans are rejected. Previews are controlled static diagrams, not audio-timed rendered videos.

Commit review also verifies that display-narration changes cannot reuse the original evidence approval, even when spoken narration and valid text mappings remain unchanged. Unexpected provider-adapter exceptions are treated as uncertain outcomes and block resume until reconciliation rather than recording a definite failure.

## Provider and cost controls

- Uses existing server-side `GEMINI_API_KEY` and `GEMINI_MODEL`, preferring process configuration and falling back only to those named values in the ignored root `.env`.
- `PLANNING_ENABLED=false` disables requests. There is no model fallback or Google Search grounding tool.
- Hard local limits: two submitted Gemini requests per workspace per UTC day and four globally; at most 7,000 output tokens per call. These supplement F6 job and byte limits. They are development safeguards, not public plan promises.
- Requests are checkpointed before submission. A completed response is saved durably before further processing, so storage retries can reuse it. Network/unknown outcomes pause and are not automatically repeated. Known quota/credential problems receive safe codes.
- Gemini account quotas and billing still apply. A request cap cannot establish an account's free-tier eligibility. Testing did not send live Gemini or ElevenLabs requests.
- Configured voice selection is available with unknown commercial rights and an explicit terms acknowledgement. F9 must verify live entitlement, voice quality and narration allowance before synthesis. No personal provider-key fallback is offered.

Provider references: [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [pricing/account tiers](https://ai.google.dev/gemini-api/docs/pricing), [MediaWiki TextExtracts](https://www.mediawiki.org/wiki/Extension:TextExtracts).

## API and database

The existing messages, apply-result, evidence and voice routes now work. New `/projects/:id/storyboard` and `/projects/:id/storyboard/approve` routes expose review and exact approval. All use cookie-backed workspace resolution, RLS and CSRF; mutations use the existing idempotency/revision model. Contracts are synchronized in OpenAPI and the generated runtime schema.

Migrations 7–10 add immutable request-count records, approval records, exact artifact binding and approved-version/evidence references, plus a narrowly granted worker function for checked automatic application. The worker still has no identity access or direct draft-edit grant. Application/approval reads use the injected private media store and verify original artifact integrity.

Apply migrations, build API/web, and restart all three local services. Existing dummy login remains valid. Old paused F6 requests need an explicit **Resume request** or a fresh submission; no automatic replay is performed.

## Verification

- Nine F7/F8 integration/adapter checks: provenance rejection, visual/Unicode validation, worker/evidence/application/approval flow, discussion, uncertain outcomes, automatic safety, daily cap, Gemini HTTP protocol and source-host/size restrictions.
- Existing project tests: 7 passed. Queue/media tests: 15 passed. Migration/foundation tests: 7 passed. Total this delivery: 38 automated checks.
- Seven isolated live-browser checks: application, voice/style persistence, unreviewed-fact blocking, immutable approval, responsive geometry, invalidation after edits and queued discussion. [Results](../ui/f7-f8/validation-results.json). These use deterministic provider adapters, real PostgreSQL/API/worker code, copied current web source and isolated dynamic ports.
- Production web/API builds and both type checks pass. A live, free Wikipedia retrieval smoke test returned two article excerpts. No live AI/speech credits were consumed.
- Full device/screen-reader review, independent multi-topic educational quality evaluation, provider-account live response evaluation and public release remain later gates.

Commands: `npm run test:f7` (F8 uses the same suite), `npm run test:f7:browser`, `npm run build:api`, `npm run build:web`.

## Next

F9: actual narration, entitlement/terms evaluation, pronunciation and validated alignment. F10: audio-matched motion rendering. F7/F8 do not synthesize speech, export a production video or publish to Instagram.
