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
const h = await platform(origin, {
  exchangeCode: async () => ({
    token: "browser-fake-token-never-use",
    expiresAt: new Date(Date.now() + 60 * 86400000),
    remoteAccountId: "17840000001",
    displayName: "newbert_demo",
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
  }),
  refreshToken: async () => ({
    token: "browser-renewed-fake-token",
    expiresAt: new Date(Date.now() + 60 * 86400000),
  }),
});
await h.app.listen({ host: "127.0.0.1", port: apiPort });
const webDir = resolve(".local/f13-browser-web", randomUUID());
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
  delete process.env.INSTAGRAM_APP_ID;
  await p.goto(origin + "/app/settings");
  await p
    .getByRole("heading", { name: "Instagram connection", exact: true })
    .waitFor();
  await p.getByText("Platform setup required", { exact: true }).waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Connect Instagram", exact: true })
      .count(),
    0,
  );
  check("Unconfigured Meta setup is honest and cannot launch sign-in");
  process.env.INSTAGRAM_APP_ID = "123456789";
  process.env.INSTAGRAM_APP_SECRET = "browser-test-app-secret";
  process.env.INSTAGRAM_API_VERSION = "v25.0";
  process.env.INSTAGRAM_TOKEN_KEY = "b".repeat(64);
  await p
    .getByRole("button", { name: "Refresh connection status", exact: true })
    .click();
  const connect = p.getByRole("button", {
    name: "Connect Instagram",
    exact: true,
  });
  await connect.waitFor();
  assert.equal(await connect.isDisabled(), true);
  const consent = p.locator(".instagram-panel input[type=checkbox]");
  await consent.check();
  assert.equal(await connect.isEnabled(), true);
  assert((await consent.boundingBox())!.width >= 16);
  await consent.uncheck();
  check("Explicit account-access acknowledgement is required");
  // Issue local test authorization through the isolated API. Do not navigate to Meta.
  const me = await (await p.request.get(origin + "/api/v1/me")).json();
  const started = await p.request.post(
    origin + "/api/v1/instagram/authorization",
    {
      headers: { Origin: origin, "X-CSRF-Token": me.csrfToken },
      data: { acknowledgedAccountAccess: true, returnPath: "/app/settings" },
    },
  );
  assert.equal(started.status(), 200, await started.text());
  const st = new URL((await started.json()).authorizationUrl).searchParams.get(
    "state",
  );
  await p.goto(
    origin +
      "/api/v1/instagram/callback?state=" +
      st +
      "&code=browser-fake-code",
  );
  await p.getByText("@newbert_demo", { exact: true }).waitFor();
  check(
    "Mocked OAuth callback shows the connected account with no token in the page",
  );
  assert(!(await p.content()).includes("browser-fake-token-never-use"));
  await p.goto(origin + "/app/publishing");
  await p.getByRole("heading", { name: "Publishing", exact: true }).waitFor();
  await p.getByText("@newbert_demo", { exact: true }).waitFor();
  await p
    .getByText("No video will be posted from this screen.", { exact: false })
    .waitFor();
  check(
    "Publishing page reports the same account and keeps posting unavailable",
  );
  await p.getByRole("button", { name: "Renew access", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: "less than 24 hours" })
    .waitFor();
  check("Too-early renewal has a recoverable explanation");
  await mkdir("docs/ui/f13", { recursive: true });
  for (const width of [1440, 768, 390, 360]) {
    await p.setViewportSize({ width, height: 950 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Instagram panel overflow at " + width,
    );
  }
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.screenshot({
    path: "docs/ui/f13/publishing-desktop.png",
    fullPage: true,
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({
    path: "docs/ui/f13/publishing-mobile.png",
    fullPage: true,
  });
  check("Connection controls fit desktop, tablet and mobile");
  await p.getByText("Disconnect this account", { exact: true }).click();
  await p
    .getByRole("button", { name: "Disconnect Instagram", exact: true })
    .click();
  await p
    .getByText("Instagram disconnected from Newbert.", { exact: false })
    .waitFor();
  await p
    .getByText("@newbert_demo", { exact: true })
    .waitFor({ state: "hidden" });
  check("Explicit disconnect removes the account and stored token");
  assert.equal(
    (
      await h.db.query(
        "SELECT * FROM newbert.instagram_secrets WHERE workspace_id=$1",
        [user.workspaceId],
      )
    ).rowCount,
    0,
  );
  await writeFile(
    "docs/ui/f13/validation-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        externalMetaRequests: 0,
        mode: "Isolated API/database and mocked Meta adapter. No real account access or publication.",
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
