# Module boundary

Add modules as their features start: identity/workspaces, projects/versions, ideation/evidence, generation/jobs, artifacts, usage, provider connections and publishing. Each module owns its service/domain/repository boundaries; the HTTP layer validates and authorizes requests. Workers call these boundaries rather than duplicating business rules.

No empty service implementations or fake-success endpoints are included in F1. API routes remain defined by `docs/api/openapi-v1.json` until implemented in their feature milestone.
