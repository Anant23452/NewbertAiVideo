# Product screens — Stitch review set

Started: 29 October 2026. Review set prepared: 30 October 2026. Status: all 11 desktop concepts approved by the user on 30 October; F1 foundation is complete for review. See [project status](../PROJECT-STATUS.md) for implementation progress.

[Open all designs in Stitch](https://stitch.withgoogle.com/projects/2520368196713015322) · [Local review gallery](PRODUCT-DESIGN-REVIEW.html) · [Screen overview](product-screens-overview.png) · [Export manifest](product/manifest.json)

Homepage direction approved by the user. Continue the same [Stitch project](https://stitch.withgoogle.com/projects/2520368196713015322), using black, electric violet, ice mint, white type, meaningful motion diagrams and readable Hindi. The request for other product pages does not add a purchase/billing module; billing is outside the V1 PRD.

## Page set

| Screen | Purpose |
|---|---|
| Creator dashboard | Start a topic, resume work, see allowance and recent projects |
| Projects | Search/filter drafts, ready outputs and work needing attention |
| Create a video | Optional idea discussion, language/audience/voice/style and guided/automatic choice |
| Storyboard review | Narration, meaningful scene visuals, evidence and guided approval |
| Generation progress | Honest stage state, cancellation, preserved previous output and recovery |
| Video preview | Playback concept, downloads, revisions/history and exact-version scheduling drawer |
| Publishing | Planned V1 calendar/agenda, one account, reschedule and uncertain-outcome handling |
| Settings | Personal voice connection, Instagram design, allowance and preferences |
| Sign in | Email/password entry, carried-over topic, registration/recovery entry points |
| Create account | Personal account entry, carried-over idea and verification handoff |
| Password recovery | Reset request, safe confirmation and expired-link recovery |

All values/accounts in designs are samples. Production capacities, provider permissions/rights and Instagram availability are not established by screen artwork. Prototype durations are 39s and 21s. No fake completion percentages, unlimited usage, psychology statistics, paid plans, multiple workspaces or pro editing timeline.

## Shared navigation

Desktop: Dashboard → Projects → Create a video → Publishing → Settings. One personal workspace; no team switcher. Authentication is standalone. Project workflow: Idea → Storyboard → Generate → Preview. Automatic mode skips manual script approval while keeping quality checks. Generating a video does not authorize posting it.

## Responsive handoff

Desktop screenshots are the requested review deliverable. Responsive layout instructions are included in every Stitch prompt and export; dedicated mobile Stitch screens were not generated. Exported HTML is checked in headless Edge at 1440, 768, 390 and 360 pixels; see [geometry results](product/responsive-review.json). This checks overflow and runtime errors, not complete mobile interaction, touch-device, accessibility or backend behavior. Full acceptance remains part of development.

| Width | Adaptation |
|---|---|
| >=1200px | Sidebar and main/supporting columns |
| 768–1199px | Collapsed navigation; supporting panels stack or use drawers |
| 360–767px | Navigation drawer, one column, wrapping actions, 44px touch targets |

Scene cards become an accordion, tables become stacked cards, preview drawers become fullscreen sheets, and the publishing calendar becomes an agenda. No horizontal page scroll. Caption-safe-area visibility and Devanagari text must survive resizing. Keyboard focus, labels, error text, contrast and reduced-motion behavior are implementation acceptance criteria.

## Required states in development

- Empty/search-empty project list; loaded; fetching; access denied/missing project.
- Draft saving/saved/conflict; preserve unsaved work on a stale edit.
- Queue/running/paused/failed/cancel-requested/cancelled/ready; no blind replay of uncertain paid speech requests.
- Voice connection pending/connected/permission error/revoked; don't silently substitute a voice/key.
- Publishing disconnected/scheduled/paused/submitted/reconciliation/published; exact-version destination binding.
- Authentication validation/submission failure/recovery/email verification as supported by chosen auth adapter.

Review screen hierarchy, sample consistency, intended actions, failure recovery and responsive behavior before the first development milestone. No production app pages, API connections, migrations or deployment are part of this design task.

Export note: the publishing HTML handoff includes a small additional account-badge wrapping correction at narrow mobile widths. Desktop artwork is unchanged; carry this layout correction into implementation rather than assuming the raw Stitch export is production-ready. Account description also clarifies that schedules select an exact ready video version.
