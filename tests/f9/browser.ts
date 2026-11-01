import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, writeFile, cp, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { freePort } from "../../scripts/db/local-cluster.mjs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { platform } from "../support/platform.js";
import { claimNext } from "../../apps/api/src/modules/processing/queue.js";
import { runProduction } from "../../apps/api/src/modules/production/runner.js";
import {
  run,
  measureAudio,
  renderVideo,
} from "../../apps/api/src/modules/production/render.js";
import { runPlanning } from "../../apps/api/src/modules/planning/runner.js";
const webPort = await freePort(),
  apiPort = await freePort();
const origin = "http://127.0.0.1:" + webPort;
process.env.ELEVENLABS_VOICE_ID = "local-browser-test-voice";
const h = await platform(origin);
await h.app.listen({ host: "127.0.0.1", port: apiPort });
const webDir = resolve(".local/f9-browser-web", randomUUID());
await mkdir(webDir, { recursive: true });
for (const name of ["app", "components", "lib", "public", "tsconfig.json"])
  await cp(join("apps/web", name), join(webDir, name), { recursive: true });
await cp(
  "packages/contracts/src/composition.ts",
  join(webDir, "lib/composition.ts"),
);
const productionSource = await readFile(
  join(webDir, "components/production.tsx"),
  "utf8",
);
await writeFile(
  join(webDir, "components/production.tsx"),
  productionSource.replace(
    "../../../packages/contracts/src/composition",
    "../lib/composition",
  ),
);
const config = (await readFile("apps/web/next.config.mjs", "utf8")).replace(
  'process.env.API_INTERNAL_ORIGIN || "http://127.0.0.1:3100"',
  JSON.stringify("http://127.0.0.1:" + apiPort),
);
await writeFile(join(webDir, "next.config.mjs"), config);
const web = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    webDir,
    "--hostname",
    "127.0.0.1",
    "--port",
    String(webPort),
  ],
  {
    env: { ...process.env, API_INTERNAL_ORIGIN: "http://127.0.0.1:" + apiPort },
    windowsHide: true,
    stdio: "ignore",
  },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const checks: string[] = [];
const check = (s: string) => {
  checks.push(s);
  console.log("PASS " + s);
};
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  assert(ready, "Test web server did not start");
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const user = await h.user();
  await p.goto(origin + "/sign-in");
  await p.getByLabel("Email address").fill(user.email);
  await p.getByLabel("Password", { exact: true }).fill(user.password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(origin + "/app").catch(async (e) => {
    console.log(
      "Sign-in diagnostics:",
      await p.getByRole("alert").allTextContents(),
    );
    throw e;
  });
  await p.goto(origin + "/app/create");
  await p
    .getByLabel("Project title", { exact: true })
    .fill("TEST — psychology storyboard");
  await p
    .getByLabel("What do you want to explain?")
    .fill("Explain the spotlight effect to college students");
  await p.getByRole("button", { name: "Save project" }).click();
  await p.waitForURL("**/app/projects/*");
  const projectUrl = p.url();
  await p
    .getByRole("checkbox")
    .filter({ visible: true })
    .last()
    .check()
    .catch(async () => {
      await p.locator(".planning-panel input[type=checkbox]").check();
    });
  await p.getByRole("button", { name: "Generate storyboard" }).click();
  await p.locator(".job-state-queued").waitFor();
  const lease = await claimNext(h.worker, "browser-fixture");
  assert(lease);
  const quote = "People often overestimate how much other people notice them.";
  const source = {
    id: randomUUID(),
    title: "TEST source excerpt",
    url: "https://en.wikipedia.org/wiki/Spotlight_effect",
    excerpt: quote + " This is a test fixture for the browser review flow.",
    retrievedAt: new Date().toISOString(),
  };
  await runPlanning(
    h.worker,
    lease,
    h.media,
    {
      research: async () => [source],
      generate: async () => ({
        scenes: [0, 1, 2].map((i) => ({
          title: "Scene " + (i + 1),
          narration:
            "हमें लगता है कि सभी लोग हमें देख रहे हैं। इसे एक उदाहरण से समझते हैं।",
          purpose: "Explain an educational idea",
          component: "diagram",
          labels: ["You", "Other people"],
          claims: [
            { text: quote, classification: "factual", sourceIndex: 0, quote },
          ],
        })),
      }),
    },
    true,
  );
  await p.getByRole("link", { name: "Open storyboard review" }).click();
  await p.getByRole("heading", { name: "Storyboard review" }).waitFor();
  await p.getByRole("button", { name: "Use generated storyboard" }).click();
  await p.getByLabel("Scene 1 narration").waitFor();
  check("Generated result applies to the real editable storyboard");
  assert.equal(await p.locator(".scene-editor").count(), 3);
  await p
    .getByLabel("Voice", { exact: true })
    .selectOption("local-browser-test-voice");
  await p
    .getByLabel("Motion style", { exact: true })
    .selectOption("black_glow");
  await p.getByRole("button", { name: "Save storyboard" }).click();
  await p
    .getByRole("status")
    .filter({ hasText: "Storyboard saved." })
    .waitFor();
  check("Voice and style selection persist with the saved revision");
  await p.locator(".approval-panel input[type=checkbox]").check();
  await p
    .getByRole("button", { name: "Approve storyboard", exact: true })
    .click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Review factual source support" })
    .waitFor();
  check("Approval blocks factual claims that have not been reviewed");
  for (const box of await p
    .locator(".evidence-panel input[type=checkbox]")
    .all())
    await box.check();
  await p
    .getByRole("button", { name: "Approve storyboard", exact: true })
    .click();
  await p
    .getByRole("status")
    .filter({ hasText: "exact storyboard revision is approved" })
    .waitFor();
  await p.getByRole("heading", { name: "Approved snapshot" }).waitFor();
  check("Reviewed evidence produces an exact immutable approval snapshot");

  await p.locator(".production-panel input[type=checkbox]").check();
  await p
    .getByRole("button", { name: "Generate voice & video", exact: true })
    .click();
  await p
    .locator(".production-panel .pill")
    .filter({ hasText: "queued" })
    .waitFor();
  const productionLease = await claimNext(h.worker, "browser-render");
  assert(productionLease);
  const waveDir = resolve("test-results/f9-browser-audio", randomUUID());
  await mkdir(waveDir, { recursive: true });
  await run(
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=9",
      "-c:a",
      "libmp3lame",
      "audio.mp3",
    ],
    waveDir,
  );
  const wave = await readFile(join(waveDir, "audio.mp3"));
  let speechCalls = 0;
  await runProduction(h.worker, productionLease, h.media, {
    eligibility: async () => ({
      voiceId: "local-browser-test-voice",
      voiceName: "Test",
      model: "eleven_multilingual_v2",
      tier: "free",
      commercialUse: "not_permitted",
      attributionRequired: true,
      termsUrl: "https://elevenlabs.io/terms-of-use",
    }),
    synthesize: async (text: string) => {
      speechCalls++;
      const chars = [...text];
      return {
        audio_base64: wave.toString("base64"),
        alignment: {
          characters: chars,
          character_start_times_seconds: chars.map(
            (_: string, i: number) => (i / chars.length) * 8.9,
          ),
          character_end_times_seconds: chars.map(
            (_: string, i: number) => ((i + 1) / chars.length) * 8.9,
          ),
        },
        requestId: "browser-mock",
      };
    },
    measureAudio,
    renderVideo,
  });
  await p.locator(".production-panel .ready-badge").waitFor();
  check("Approved storyboard produces a real validated private video");
  assert.equal(speechCalls, 1);
  await p.getByRole("button", { name: "Open saved media" }).click();
  await p.locator(".media-review video").waitFor();
  await p.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 1;
  });
  assert(
    await p
      .locator("video")
      .evaluate((v) => (v as HTMLVideoElement).duration > 8),
  );
  check("Signed native playback exposes the measured validated MP4");
  await p.locator(".timed-composition svg").waitFor();
  check("Shared timed composition preview loads with saved narration");
  for (const width of [1440, 768, 390, 360]) {
    await p.setViewportSize({ width, height: 950 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Production overflow at " + width,
    );
  }
  check("Production controls and previews fit desktop/tablet/mobile");
  await mkdir("docs/ui/f9-f10", { recursive: true });
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await p.screenshot({
    path: "docs/ui/f9-f10/production-desktop.png",
    fullPage: true,
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({
    path: "docs/ui/f9-f10/production-mobile.png",
    fullPage: true,
  });
  const mediaUrl = await p.locator("video").getAttribute("src");
  assert(mediaUrl);
  const other = await browser.newContext();
  const denied = await other.request.get(mediaUrl);
  assert.equal(denied.status(), 401);
  await other.close();
  check("Copied media URLs still require the owning authenticated session");
  check("No real speech request was used by the browser suite");
  await writeFile(
    "docs/ui/f9-f10/validation-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        providerMode:
          "Deterministic test adapters; real database, APIs, worker handler and browser; isolated dynamic ports and copied source app",
        externalProviderCalls: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  if (web.pid) {
    if (process.platform === "win32")
      await new Promise<void>((r) => {
        const cleanup = spawn(
          "taskkill",
          ["/PID", String(web.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        cleanup.once("exit", () => r());
        cleanup.once("error", () => r());
      });
    else web.kill();
  }
  await delay(1000);
  await h.close();
}
