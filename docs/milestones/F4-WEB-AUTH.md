# F4 — Homepage, responsive workspace and connected identity UI

Date: 30 October 2026. Status: complete for review. Local release only; no public deployment.

## Delivered

- Next.js App Router, React and strict TypeScript, following the approved black/violet/mint Stitch designs with reusable components and responsive layouts.
- Homepage: topic/language composer, workflow, actual psychology and binary video examples, honest release FAQ and account entry points. No autoplay audio, external analytics, provider requests or fabricated examples.
- Real registration, email verification/resend, sign-in, recovery/reset, password change and sign-out through F3 APIs. Reset removes the token from the address after success. Verification never signs users in automatically.
- Personal workspace shell: desktop sidebar, mobile menu, overview, settings and clearly unavailable project/create/publishing sections. No invented projects, quotas, connected Instagram accounts or schedules.
- Real timezone settings, persisted to PostgreSQL with CSRF and revision checks. Conflicting changes reload current settings before retry.
- Loading, retry, validation, rate-limit and access errors; labelled forms, autocomplete, visible focus, reduced motion and Devanagari-capable system font fallbacks. Closed mobile navigation is hidden from keyboard focus.

## Boundaries and security

Browser API requests use the same web origin; Next rewrites `/api/*` to the loopback Fastify API. `AUTH_BASE_URL` and `APP_ORIGIN` in the ignored API environment must both match `http://127.0.0.1:3001`. No broad CORS or provider secrets in the web bundle.

Sessions remain HttpOnly cookies. CSRF is held in React memory, never browser storage. The API remains the authentication/ownership authority; static workspace routes contain no private data and show no workspace content until API identity validation succeeds. Backend outages show a retry state rather than being treated as signed-out sessions. Return destinations are restricted to plain `/app` paths. Headers deny framing and referrers; development request logging is disabled to avoid logging email-link query tokens.

Only the optional nonsecret topic and language are stored in sessionStorage, with a clear unsaved preview and discard action. They are not submitted as a project; sign-out clears them. Never enter credentials into topic text.

Development email is stored privately in `.local/auth-mailbox`. `npm run auth:mail -- your@email.example --open` opens the latest verification message; add `--reset` for recovery. The helper validates the configured loopback origin and does not print tokens. There is no public mailbox route. Real SMTP delivery remains deployment configuration.

Existing prototype commands are preserved. The two existing video MP4s and extracted posters are public homepage examples; no new narration or video generation was charged. ElevenLabs attribution and provider-use caveats remain visible.

## Running

1. Keep local PostgreSQL running on port 54329. Do not launch a second copy if already running.
2. For first setup, apply migrations and run `npm run auth:setup`; configure both public origins as above.
3. Run `npm run dev:api` (3100).
4. Run `npm run dev:web` (3001), or `npm run build:web` followed by `npm run start:web`.
5. Open `http://127.0.0.1:3001` using exactly that host rather than localhost, so cookies and origin checks agree.

## Verification

- Frontend production build and frontend/backend type checks pass.
- Return-path security test covers external hosts, deceptive prefixes, encoded traversal, backslashes, whitespace, overlong destinations and allowed nested app routes.
- 13 live-browser checks pass against actual local Fastify/PostgreSQL: homepage, widths, anonymous redirect, registration, emailed verification callback, verified sign-in, HttpOnly/no-localStorage credentials, timezone persistence, workspace navigation/widths, sign-out, emailed password reset/token removal, authenticated password change, and account-screen widths.
- Homepage/workspace geometry checked at 1440, 768, 390 and 360px; identity screens at 1440, 390 and 360px. These checks are not a complete screen-reader/device/accessibility audit.
- Dependency audit reports zero known vulnerabilities at implementation time.
- Results: [browser checks](../ui/f4/validation-results.json); [desktop homepage](../ui/f4/home-desktop.png), [mobile homepage](../ui/f4/home-mobile.png), [desktop workspace](../ui/f4/workspace-desktop.png).
- Repeat with `npm run test:f4` and `npm run test:f4:browser`. Browser checks require local servers and create an isolated-by-account test workspace in the development database; test accounts are retained for inspection. Test email addresses use `example.test`. No paid APIs or external email.

## Next

F5: real projects, library, ownership-checked CRUD, conflict-aware draft editing and immutable submitted versions. Production generation, media storage, provider connections, Instagram and hosting remain later milestones. No cloud resources were provisioned.
