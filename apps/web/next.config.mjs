const configuredApi = process.env.API_INTERNAL_ORIGIN?.trim();
const api = configuredApi || (process.env.VERCEL ? null : "http://127.0.0.1:3100");
if (api) {
  const target = new URL(api);
  if (target.username || target.password || target.pathname !== "/" || target.search || target.hash ||
      !["http:", "https:"].includes(target.protocol) ||
      (process.env.VERCEL && (target.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(target.hostname) ||
        target.hostname.endsWith(".localhost") || target.hostname === process.env.VERCEL_URL ||
        target.hostname === process.env.VERCEL_PROJECT_PRODUCTION_URL))) {
    throw new Error("API_INTERNAL_ORIGIN must be a separate HTTPS backend origin on Vercel.");
  }
}
export default {
  poweredByHeader: false,
  logging: { incomingRequests: false, browserToTerminal: false },
  devIndicators: false,
  async rewrites() {
    return {
      beforeFiles: api ? [{ source: "/api/:path*", destination: `${api.replace(/\/$/, "")}/api/:path*` }] : [],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
