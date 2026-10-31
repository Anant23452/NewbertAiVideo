# F11 — output preview, downloads and safe revisions

31 October 2026. Complete for local review; F12 personal speech-provider connections is next. No cloud deployment or publishing.

## User workflow

Open Saved videos & history from a project or storyboard. The new /app/projects/{projectId}/preview page lists completed, validated, available MP4s with version number, measured duration, size and creation date. The last successful project output is marked separately from the current draft or latest failed job. Select an output to play its exact artifact and inspect the immutable storyboard that produced it.

Download MP4 and Download captions (VTT) each request a fresh, two-minute, session-bound private access grant. Refresh playback link only renews access; it never runs a provider or renderer. Expired or unavailable media shows a recoverable error. Free-plan noncommercial and attribution requirements remain visible. VTT filenames now use .vtt and text markup is escaped.

Saved snapshots can be copied into the editable draft after expanding the replacement explanation. The request requires explicit draft-replacement acknowledgement, CSRF protection, an idempotency key and the current draft ETag. The server locks the project/draft, rejects stale revisions and archived projects, and increments the draft revision. Earlier versions and outputs are unchanged. Restored content requires fresh approval; factual narration changes still need evidence review. Restoring a planning-only snapshot may yield a brief rather than a finished storyboard.

Visual changes and permitted caption presentation corrections reuse exact matching, hash-verified narration within the workspace. Recomposition/rendering still consumes its normal generation/render allowance. Spoken text, pronunciation, selected voice, model or credential identity changes invalidate speech reuse. Missing reuse-only media pauses instead of purchasing new speech. A failed replacement keeps the last good output available in history.

## Caption scope

The editor provides one caption presentation field per scene, anchored to the entire original spoken scene. Initial corrections are deliberately limited to capitalization and a small set of punctuation characters with unchanged word count and normalized words. Numbers, signs, currency, spelling and other wording changes are rejected as CAPTION_MEANING_CHANGED; edit narration and pass the normal evidence/approval flow instead. Invalid scene IDs, duplicate overrides and partial/out-of-range anchors are rejected. Pronunciation overrides remain separate from captions. Editing narration clears its stale caption override.

Original display spans preserve the provider's actual timing. The speech fingerprint excludes caption presentation and visual choices. The browser/export paths consume the resulting same corrected timed captions. No speculative text alignment or provider request is introduced by a caption correction. General spelling corrections and arbitrary partial-span captions remain deferred pending a reliable semantic-review flow; this is narrower than the initial pipeline proposal.

## API and database

Commit review tightened caption comparison: words containing numeric characters must remain exact, and interior punctuation is preserved when comparing words. Decimal/grouping changes (including Devanagari digits) and changes such as `we're` to `were` are rejected. Regression coverage verifies these cases alongside allowed sentence-end punctuation changes.

- GET /api/v1/projects/{projectId}/outputs: cursor-paginated, newest-first successful output references; exact version/job, duration/size, optional caption artifact and latest-good marker. Only succeeded job outputs with passed validation and available storage appear.
- POST /api/v1/versions/{versionId}/restore: copy the owned immutable snapshot into its active project's draft. Body: acknowledgedDraftReplacement=true. Current draft If-Match, Idempotency-Key and X-CSRF-Token required.
- Existing version-list/detail, signed artifact access and ranged private media endpoints are reused.

No database migration is needed. Existing project/version/artifact dependencies, tenant row policies, draft revisions and command records supply persistence and isolation. Fourteen migrations / 34 domain tables remain current. No raw checkpoints, media paths or provider secrets are added to history responses.

## Verification

Four F11 integration scenarios passed against isolated PostgreSQL and real FFmpeg: exact-version private MP4/VTT downloads and cross-session denial; conflict-aware/idempotent/private restoration and renewed approval; unchanged speech fingerprint/caption timing with invalid wording/anchors rejected; failed replacement retention, successful narration reuse without TTS, and two-page stable history with distinct latest/earlier outputs.

All fourteen F9/F10 regression cases passed. All sixteen connected browser checks passed. Verification covers the existing approval/production workflow plus history, correct downloads, playback refresh without speech, decoded playback, responsive 1440/768/390/360px layouts and restoration. Evidence lives in docs/ui/f11. No live Gemini or ElevenLabs calls were used for this delivery. Backend and web production builds pass.

Release gates remain: representative listening/educational-quality review, broader accessibility and device testing, retention/backup operations and hosted deployment. F12 supplies personal encrypted provider connections; F13/F14 supply Instagram authorization and publishing.
