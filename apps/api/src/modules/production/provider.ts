import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { hash } from "../projects/core.js";
import { ProductionError } from "./timing.js";
export function speechConfig() {
  let env: Record<string, string | undefined> = {};
  try {
    env = parseEnv(readFileSync(".env", "utf8"));
  } catch {}
  const key = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY || "";
  return {
    key,
    model:
      process.env.ELEVENLABS_MODEL ||
      env.ELEVENLABS_MODEL ||
      "eleven_multilingual_v2",
    voiceId: process.env.ELEVENLABS_VOICE_ID || env.ELEVENLABS_VOICE_ID || "",
    credentialVersion: hash(key),
    enabled: process.env.SPEECH_ENABLED !== "false",
  };
}
async function json(response: Response, max = 6000000) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProductionError(
      response.status === 429
        ? "SPEECH_PROVIDER_QUOTA"
        : [401, 403].includes(response.status)
          ? "SPEECH_PERMISSIONS_REQUIRED"
          : "SPEECH_PROVIDER_REJECTED",
      response.status >= 500,
    );
  }
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new ProductionError("SPEECH_RESPONSE_TOO_LARGE", true);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new ProductionError("SPEECH_RESPONSE_INVALID", true);
  }
}
export async function eligibility(
  voiceId: string,
  characters: number,
  fetcher: typeof fetch = fetch,
) {
  const c = speechConfig();
  if (!c.enabled || !c.key) throw new ProductionError("SPEECH_NOT_CONFIGURED");
  if (c.model !== "eleven_multilingual_v2")
    throw new ProductionError("SPEECH_MODEL_NOT_SUPPORTED");
  if (voiceId !== c.voiceId) throw new ProductionError("VOICE_CHANGED");
  const headers = { "xi-api-key": c.key };
  const [sub, voice] = await Promise.all([
    json(
      await fetcher("https://api.elevenlabs.io/v1/user/subscription", {
        headers,
        signal: AbortSignal.timeout(15000),
      }),
      150000,
    ),
    json(
      await fetcher(
        "https://api.elevenlabs.io/v1/voices/" + encodeURIComponent(voiceId),
        { headers, signal: AbortSignal.timeout(15000) },
      ),
      150000,
    ),
  ]);
  if (sub.tier !== "free") throw new ProductionError("FREE_PLAN_REQUIRED");
  if (
    sub.can_extend_character_limit === true ||
    sub.max_credit_limit_extension === "unlimited" ||
    Number(sub.max_credit_limit_extension || 0) > 0
  )
    throw new ProductionError("PAID_OVERAGES_ENABLED");
  if (
    !Number.isFinite(sub.character_limit) ||
    !Number.isFinite(sub.character_count) ||
    sub.character_limit - sub.character_count < characters
  )
    throw new ProductionError("SPEECH_PROVIDER_QUOTA");
  if (voice.voice_id !== voiceId)
    throw new ProductionError("VOICE_UNAVAILABLE");
  return {
    voiceId,
    voiceName: String(voice.name || "Selected voice").slice(0, 160),
    model: c.model,
    tier: "free",
    commercialUse: "not_permitted",
    attributionRequired: true,
    termsUrl: "https://elevenlabs.io/terms-of-use",
  };
}
export async function synthesize(
  text: string,
  voiceId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  const c = speechConfig();
  try {
    const response = await fetcher(
      "https://api.elevenlabs.io/v1/text-to-speech/" +
        encodeURIComponent(voiceId) +
        "/with-timestamps?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: { "xi-api-key": c.key, "Content-Type": "application/json" },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
          : AbortSignal.timeout(90000),
        body: JSON.stringify({
          text,
          model_id: c.model,
          apply_text_normalization: "off",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );
    const requestId = (
      response.headers.get("request-id") ||
      response.headers.get("x-request-id") ||
      ""
    ).slice(0, 200);
    const value = await json(response);
    if (
      typeof value.audio_base64 !== "string" ||
      value.audio_base64.length > 5500000 ||
      !/^[a-zA-Z0-9+/]*={0,2}$/.test(value.audio_base64)
    )
      throw new ProductionError("SPEECH_RESPONSE_INVALID", true);
    return { ...value, requestId };
  } catch (e) {
    if (e instanceof ProductionError) throw e;
    throw new ProductionError("SPEECH_OUTCOME_UNKNOWN", true);
  }
}
