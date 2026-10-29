# V1 PRD comparison and refinement decisions

Date: 28 October 2026
Inputs: existing Newbert AI Video V1 PRD and the user-supplied pasted planning excerpt.

## Assessment

The existing PRD defines Newbert's agreed product and low-cost multi-user pilot. The supplied excerpt is stronger on detailed interaction behavior, artifact versioning, captions, retries, and publishing races. It also contains assumptions for a different product named NamasteVideo.ai, including English narration, fixed video length, internal-only access, and a prescribed stack. The excerpt starts mid-sentence and has several missing section introductions, so it is a partial reference rather than a complete replacement PRD.

The refined PRD combines the stronger workflow requirements with Newbert's confirmed product scope. Reference proposals are distinguished from user-confirmed requirements and implementation decisions.

## Comparison and decisions

| Area | Existing Newbert PRD | Supplied excerpt | Refined decision |
| --- | --- | --- | --- |
| Product name | Newbert AI Video | NamasteVideo.ai | Keep Newbert AI Video; no rename requested |
| Users | Many registered users, private individual workspaces | Founder and approved internal users only | Keep multi-user product; controlled pilot admission is permitted, not a permanent internal-only restriction |
| Instagram | One per workspace | One per user; no shared destination | Keep one workspace/user and one account/workspace; add account conflict and reconnection rules |
| Language | Hindi and Hinglish | English, Indian English voice presets | Keep Hindi/Hinglish; stock voices must pass language tests |
| Duration | Determined by narration | Mandatory 60–90 seconds | Keep narration-driven length with benchmarked resource cap |
| Automation | Optional guided review; automatic generation and authorized publishing | Storyboard and final approval mandatory | Keep both modes; add precise authorization rules without forcing manual review on automatic mode |
| Captions | Optional burned-in captions | Default visible captions, phrase timing, text correction | Adopt default captions, validated alignment, two-line layout, and separate display corrections |
| Revision | Script versioning | Global and scene-specific conversational editing | Add bounded supported revisions, stable scene IDs, dependency invalidation, and previous-output preservation |
| Persistence | Checkpoints and project history | Autosave, immutable jobs, conflict handling | Adopt detailed autosave and immutable version behavior |
| Job model | Stage/status list with separate publishing | Separate editing, generation, and publishing dimensions | Separate job state, generation stage, draft version, and publishing state |
| Publishing | Scheduling, reconciliation, token recovery | Detailed OAuth, payload pinning, race handling | Adopt stronger connection, schedule, cancellation, and reconciliation requirements |
| Personal keys | Optional ElevenLabs credentials | Bring-your-own-key excluded | Keep optional ElevenLabs credentials; avoid broad provider-routing scope |
| Usage | Daily allowances and budget limits | No per-user usage ledger | Keep minimal usage reservations and enforcement; no billing or full cost dashboard |
| Stack | Candidate tools; hosting unselected | Next.js/Gemini/ElevenLabs/Remotion/MongoDB/R2/Inngest/Vercel | Record as a candidate stack; benchmark before commitment |
| Retention | Disclosed pilot policy | Retain indefinitely until deleted | Keep explicit retention policy because storage is limited; defer complex policy tooling |
| Evaluation | Core functional acceptance | 20-topic corpus, listening/visual/race tests | Adopt representative 20-topic evaluation adapted to Hindi/Hinglish and varied durations |

## Important issues resolved

1. A fixed duration would contradict the user's audio-driven duration requirement. Approximate length remains a scripting preference; only the resource cap is enforced as a hard limit.
2. Mandatory final human approval would defeat the requested automatic environment. Publishing still needs an explicit user instruction, which may be recorded before generation for a specific project version and destination.
3. Removing allowance tracking would leave a multi-user free pilot unable to enforce the accepted daily limits. Minimal quota accounting remains; billing infrastructure is excluded.
4. Changing personal API-key support or permanently limiting access to internal users would be a scope change. Neither is inferred from the reference.
5. A named cloud stack does not demonstrate affordable rendering. Hosting feasibility, provider eligibility, data use, and commercial output rights remain release gates.
6. Provider-generated output cannot be assumed identical on regeneration. Approved artifacts are preserved; regenerated media becomes a new version.

## Material improvements now in the PRD

- Combined storyboard review and supported scene-specific revisions.
- Default captions, alignment fallback, caption-only corrections, and proposed timing evaluation.
- Exact project versions for generation and scheduling; previous valid exports survive failures.
- Durable deduplicated jobs, bounded retries, worker recovery, and draft save conflicts.
- Clear separation between content approval and publishing authorization.
- Account connection conflicts, destination pinning, timezone rules, missed schedules, and unknown publication outcomes.
- Private media, active-asset deletion protection, worker ownership checks, and structured scene validation.
- Logical data records and a candidate stack with an explicit feasibility checkpoint.
- Expanded acceptance criteria and a realistic human review/test set.

## Remaining feasibility decisions

Speech quality, provider costs and terms, hosting, duration caps, daily allowances, retention, alignment accuracy, and Meta access still need measurement or current documentation checks. This comparison evaluates supplied requirements; it does not certify the suggested stack's current pricing or compatibility. No implementation or deployment has been performed.
