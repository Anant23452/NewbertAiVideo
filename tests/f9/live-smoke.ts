// Explicit opt-in only; this spends a small amount of the configured free speech allowance.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  eligibility,
  speechConfig,
  synthesize,
} from "../../apps/api/src/modules/production/provider.js";
import {
  speechManifest,
  align,
} from "../../apps/api/src/modules/production/timing.js";
import {
  measureAudio,
  renderVideo,
  run,
} from "../../apps/api/src/modules/production/render.js";
if (process.env.ALLOW_LIVE_SPEECH !== "true")
  throw new Error(
    "Set ALLOW_LIVE_SPEECH=true to opt into a bounded live free-tier speech test.",
  );
const config = speechConfig();
const narration = "Binary में सिर्फ zero और one होते हैं।";
const content = {
  schemaVersion: 1,
  brief: {
    topic: "Explain binary",
    language: "Hinglish",
    audience: "college",
    mode: "guided",
  },
  voice: { catalogVoiceId: config.voiceId, providerConnectionId: null },
  style: { preset: "black_glow", accentColor: "#A18BFF" },
  scenes: [
    {
      id: randomUUID(),
      purpose: "Explain binary digits",
      component: "comparison",
      title: "दो symbols. एक भाषा.",
      displayNarration: narration,
      spokenNarration: narration,
      textMappings: [],
      objects: ["0 · Zero", "1 · One"].map((label) => ({
        id: randomUUID(),
        type: "node",
        label,
        parameters: { shape: "circle" },
      })),
      cues: [],
      claimIds: [],
    },
  ],
  pronunciationOverrides: [],
  captionOverrides: [],
};
const manifest = speechManifest(content, config);
if (manifest.characters > 80)
  throw new Error("Smoke request exceeds bounded character allowance.");
const dir = resolve("test-results/f9-live-smoke");
await mkdir(dir, { recursive: true });
await eligibility(config.voiceId, manifest.characters);
const response = await synthesize(manifest.text, config.voiceId);
await writeFile(
  dir + "/audio.mp3",
  Buffer.from(response.audio_base64, "base64"),
);
const duration = await measureAudio(dir);
const timing = align(manifest, response.alignment, duration);
const result = await renderVideo(dir, timing, content);
await run(
  ["-y", "-ss", "1", "-i", "video.mp4", "-frames:v", "1", "poster.png"],
  dir,
);
await writeFile(dir + "/timing.json", JSON.stringify({ timing, content }));
await writeFile(
  "docs/db/f9-live-smoke.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      submittedCharacters: manifest.characters,
      tier: "free",
      model: config.model,
      commercialUse: "not_permitted",
      attributionRequired: true,
      validation: result.validation,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    liveSpeech: "passed",
    submittedCharacters: manifest.characters,
    narrationSeconds: duration,
    videoValidated: result.validation.passed,
    output: dir + "/video.mp4",
  }),
);
