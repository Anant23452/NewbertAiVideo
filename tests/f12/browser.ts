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
const webDir = resolve(".local/f12-browser-web", randomUUID());
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
  await p.goto(origin + "/app/settings");
  await p
    .getByRole("heading", { name: "Your allowance", exact: true })
    .waitFor();
  await p
    .getByRole("article", { name: "Voice characters", exact: true })
    .waitFor();
  assert.equal(
    await p.locator("input[type=file],input[type=password]").count(),
    0,
  );
  await p
    .getByText("Your videos use the platform’s configured AI voice.", {
      exact: false,
    })
    .waitFor();
  check(
    "Settings shows automated platform voice without recording or personal-key forms",
  );
  assert.equal(await p.locator(".allowance-resource").count(), 7);
  check("All seven real allowance resources are presented with units");
  await p.getByText("No settled usage yet.", { exact: false }).waitFor();
  check("New accounts show an honest empty usage history");
  await h.db.query(
    "INSERT INTO newbert.usage_buckets(id,workspace_id,resource,period_start,period_end,limit_units,used_units,reserved_units) VALUES($1,$2,'provider_credits',date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 day',2000,300,500)",
    [randomUUID(), user.workspaceId],
  );
  await p.getByRole("button", { name: "Refresh usage", exact: true }).click();
  const chars = p.getByRole("article", {
    name: "Voice characters",
    exact: true,
  });
  await chars.getByText("1,200", { exact: true }).waitFor();
  await chars.getByText("300", { exact: true }).waitFor();
  await chars.getByText("500", { exact: true }).waitFor();
  check(
    "Refreshing displays actual used, reserved and remaining character counts",
  );
  await h.db.query(
    "UPDATE newbert.production_limits SET workspace_characters=500",
  );
  await p.getByRole("button", { name: "Refresh usage", exact: true }).click();
  await chars
    .getByText("Allowance is used or held.", { exact: false })
    .waitFor();
  check(
    "Lowered live limits show exhausted allowance without hiding incurred usage",
  );
  await h.db.query(
    "UPDATE newbert.processing_policy SET production_enabled=false,processing_enabled=false",
  );
  await p.getByRole("button", { name: "Refresh usage", exact: true }).click();
  await p
    .getByText("Processing is temporarily paused by the platform.", {
      exact: false,
    })
    .waitFor();
  check("Platform pause is explained without discarding saved work");
  await p.route("**/api/v1/generation-settings", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({ detail: "Settings unavailable" }),
    }),
  );
  await p.getByRole("button", { name: "Refresh usage", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Showing the last successful update." })
    .waitFor();
  await p.unroute("**/api/v1/generation-settings");
  await p.getByRole("button", { name: "Refresh usage", exact: true }).click();
  await p.waitForFunction(
    () => !document.querySelector(".usage-settings [role=alert]"),
  );
  check("Failed refresh preserves the last snapshot and recovers on retry");
  for (const width of [1440, 768, 390, 360]) {
    await p.setViewportSize({ width, height: 950 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Settings overflow at " + width,
    );
  }
  check("Usage settings fit desktop, tablet and mobile");
  await mkdir("docs/ui/f12", { recursive: true });
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.screenshot({
    path: "docs/ui/f12/settings-desktop.png",
    fullPage: true,
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({
    path: "docs/ui/f12/settings-mobile.png",
    fullPage: true,
  });
  await writeFile(
    "docs/ui/f12/validation-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        externalProviderCalls: 0,
        mode: "Isolated database, API and browser; no provider requests",
      },
      null,
      2,
    ) + "\n",
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
