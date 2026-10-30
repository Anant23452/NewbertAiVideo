# Shared contracts boundary

Canonical design: `docs/api/openapi-v1.json` and `docs/API-DB-DESIGN-V1.md`. Do not maintain a competing hand-written API schema here.

F2 selected TypeScript. Generate or validate shared request/response types from the reviewed OpenAPI contract as feature consumers are implemented, and define versioned scene documents at this boundary. Changes must update the contract, affected consumers and milestone acceptance checks together. Secrets and provider SDK objects do not cross this boundary into browser data.
