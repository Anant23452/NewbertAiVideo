// The separate Fastify API handles configured deployments through beforeFiles rewrites.
// A frontend-only deployment must fail clearly instead of forwarding to localhost.
function unavailable() {
  return Response.json(
    { code: "BACKEND_NOT_CONFIGURED", detail: "The backend service has not been connected to this deployment." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export const GET = unavailable;
export const POST = unavailable;
export const PATCH = unavailable;
export const PUT = unavailable;
export const DELETE = unavailable;
export const OPTIONS = unavailable;
