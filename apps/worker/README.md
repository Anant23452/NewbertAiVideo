# F7/F8 planning worker

After `npm run db:migrate` and `npm run worker:setup`, run `npm run dev:worker` from the root in a separate terminal. It uses the ignored `WORKER_DATABASE_URL` with a restricted worker role, not API/auth/owner credentials. Compiled startup: `npm run build:api`, then `npm run start:worker`.

The consumer claims fairly across workspaces, acknowledges the PostgreSQL outbox, fences leases, recovers crashes and pauses unknown provider outcomes. Planning and ideation handlers now retrieve sources and use bounded Gemini requests, preserve durable attempt checkpoints, and publish private storyboard/evidence results. Speech and rendering handlers remain absent. See docs/milestones/F7-F8-PLANNING-STORYBOARD.md. Graceful shutdown pauses claimed work instead of cancelling the user's request.

See [F6 scope and controls](../../docs/milestones/F6-PROCESSING.md) and [ADR 003](../../docs/decisions/ADR-003-DURABLE-PROCESSING.md). Do not import the old prototype job runner into this worker. F7–F10 must add stage-specific reservations, durable attempt checkpoints and validated outputs through the fenced artifact service.
