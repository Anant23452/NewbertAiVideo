import { instagramConfig } from "../../apps/api/src/modules/instagram/config.js";
const cfg = instagramConfig(process.env.APP_ORIGIN || "http://127.0.0.1:3001");
console.log(
  JSON.stringify(
    {
      configured: cfg.configured,
      missing: cfg.missing,
      liveProviderRequests: 0,
    },
    null,
    2,
  ),
);
