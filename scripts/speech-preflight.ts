import {
  eligibility,
  speechConfig,
} from "../apps/api/src/modules/production/provider.js";
try {
  const c = speechConfig();
  const result = await eligibility(c.voiceId, 1);
  console.log(
    JSON.stringify({
      accessible: true,
      tier: result.tier,
      model: result.model,
      commercialUse: result.commercialUse,
      attributionRequired: true,
      generatedCharacters: 0,
    }),
  );
} catch (e) {
  console.error(
    "Speech eligibility unavailable: " +
      (e && typeof e === "object" && "code" in e
        ? e.code
        : "check connectivity and server configuration"),
  );
  process.exitCode = 1;
}
