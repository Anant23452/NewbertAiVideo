# Worker boundary

Durable worker implementation starts in F6. Claim jobs from PostgreSQL with leases/fencing, perform work outside web requests, and checkpoint immutable private artifacts. Keep provider calls separate from database transactions.

F1 contains no running worker, fake queue or idle polling process. Existing `lib/jobs.mjs` is prototype evidence, not the production worker. Reuse its feasibility learnings after reviewing against the approved design.
