# A simpler Newbert video workflow

Updated 1 November 2026. This separates working local behavior from a future cloud deployment.

## What you do

1. Sign in. Home lists your active projects, with archived projects available through the filter. It loads 20 at a time and provides Load more projects, replacing the old four-project-only dashboard.
2. Create a project, enter the topic/language and select a visual style. Dark & light is the default for new projects created in the UI; existing projects keep their saved style.
3. Choose Generate storyboard. The worker retrieves source excerpts and Gemini writes the actual narration, scene titles, visual labels and evidence metadata.
4. Review the generated storyboard, apply it to the draft, select the voice and approve the saved content. This review is still required for guided projects; no approval is silently granted.
5. Choose Generate voice & video. ElevenLabs supplies speech and character timestamps. Newbert validates/measures the audio, derives scene and caption timing, and renders the controlled motion graphics with FFmpeg/libass.
6. The validated output is saved privately. Home refreshes project metadata every ten seconds while visible and shows the latest successful video. Play it directly there, expand/copy its saved voice-matched captions, or open Download & history. Signing out and back in does not delete saved projects or videos. Only one home video plays at a time.

Caption means on-video subtitles here, as clarified by the user. Social-post descriptions and Instagram posting remain separate future work.

## Video appearance

New renderer version newbert-ass-v2 uses larger, bold, horizontally centered caption phrases below the main graphic, within a contrasting panel. Short groups contain at most four words and two lines. Active words use actual provider-derived timing and a mint highlight. A restrained 3% caption entry close-up appears in the preview and export. Dark & light alternates dark and light scene backgrounds with corresponding text colors and keeps the caption panel dark for contrast.

No spoken content or timing is invented for highlighting. Text fitting is checked against the new larger font before buying speech. Existing MP4 files are immutable and keep their original appearance; select the style, review/re-approve changes and render a new output to use the new look. Matching validated narration can be reused under the existing fingerprint rules. Old composition previews without word timings retain their earlier caption layout.

## Where files live now

The worker renders on this computer's CPU. New MP4, audio, captions, compositions and reports now use the private Supabase bucket `NewbertAiVideo`. Older objects remain in `.local/private-media/{workspaceId}/{artifactId}` and are read there only when missing from the bucket. Retain this directory: older files have not been migrated. PostgreSQL still runs locally and stores ownership, versions and object metadata; access still uses Newbert's authenticated short-lived media grants. [Integration details and live verification](SUPABASE-CONNECTION-PLAN.md).

## What Vercel would host

Recommended separation for this application's current architecture:

| Piece | Job | Current | Future deployment |
|---|---|---|---|
| Website | Sign-in screens, projects, preview controls | Local Next.js | Vercel frontend |
| Backend/API | Sessions, ownership, jobs, signed access | Local Fastify | A reachable hosted backend, or a separately reviewed serverless adaptation |
| Rendering worker | Gemini/ElevenLabs calls, timing, FFmpeg encoding | Local Node/FFmpeg process | Separate CPU worker/container with fonts and bounded jobs |
| Database | Saved users/projects/job and artifact records | Local PostgreSQL | Hosted PostgreSQL after role/migration compatibility checks |
| Private file storage | Audio, MP4, captions | Supabase private bucket for new objects; local fallback for older files | Retention, budgets and legacy migration checks before pilot |

A normal Vercel Function filesystem is read-only apart from temporary /tmp scratch space. It is not the place to persist this application's private media directory. Deploying Next.js alone does not deploy this Fastify API or start the long-running worker. A Vercel server's localhost also does not mean the creator's laptop. The backend and media URLs must be reachable from the deployed app.

Our choice is to keep the rendering worker separate; this is not a claim that every Vercel compute product is incapable of video processing. API and worker hosting have not been provisioned. The Supabase adapter is integrated; its credentials, retained legacy files and storage behavior still need verification on the chosen hosts before deployment.

## Free storage versus free rendering

A storage allowance holds completed files; it does not provide the CPU worker that creates them.

- Supabase lists 1 GB free storage and 5 GB free egress, subject to plan limits. Private storage is now integrated; hosted database migration remains separate work.
- Cloudflare R2 Standard includes 10 GB-month storage and monthly operation allowances with free direct egress. Usage beyond included allowances is billable; activating R2 requires its subscription checkout.
- Neither option establishes an always-on free FFmpeg worker. An inexpensive pilot can keep rendering local, but the laptop must be running and connected to the chosen backend/database/storage. A public always-available service needs a separate compute budget or a verified limited free compute arrangement.

First finish and evaluate the local video workflow. Supabase private storage is connected. Next choose backend/worker hosting with a clear spending cap, migrate/test database roles and session configuration, verify retained files, and deploy the website to Vercel. Do not claim a cloud deployment from a frontend-only upload.

Official sources checked 1 November 2026:

- Vercel runtime filesystem: https://vercel.com/docs/functions/runtimes
- Supabase free allowances: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase storage access control: https://supabase.com/docs/guides/storage/security/access-control
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- R2 subscription setup: https://developers.cloudflare.com/r2/get-started/

Verification: 15 narration/render integration checks, a real encoder layout smoke with synthetic tone/timing, backend/web type checks and an isolated connected browser workflow. Browser coverage includes home playback/captions, more than four saved projects, reload persistence, private media ownership, existing approval/history behavior and 1440/768/390/360px layouts. No real AI credits were consumed for this UI/render refinement. Detailed results are under docs/ui/studio.
