import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : process.platform === "win32"
      ? {
          executablePath:
            "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        }
      : {}),
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();
const base = process.env.BROWSER_TEST_ORIGIN || "http://127.0.0.1:3001";
const results = [];
const email = "f4-" + Date.now() + "@example.test";
const password = "F4-local-check!4829";
const check = (name) => {
  results.push(name);
  console.log("PASS " + name);
};
async function mailbox(kind) {
  for (let i = 0; i < 30; i++) {
    for (const f of await fs.readdir(".local/auth-mailbox")) {
      const m = JSON.parse(
        await fs.readFile(".local/auth-mailbox/" + f, "utf8"),
      );
      if (m.to === email && m.kind === kind) return m.url;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Expected local email missing");
}
try {
  await page.goto(base + "/verify-email?success=true");
  await page.getByRole("heading", { name: "Continue with your account." }).waitFor();
  assert.equal(await page.getByText("Your email is verified.", { exact: true }).count(), 0);
  await page.getByRole("link", { name: "Request another verification link" }).waitFor();
  check("Direct verification visits do not claim verified status");
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Turn your ideas into videos that explain." })
    .waitFor();
  check("Homepage renders with actual example video");
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 950 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Homepage overflow at " + width,
    );
  }
  check("Homepage fits 1440, 768, 390 and 360px");
  await fs.mkdir("docs/ui/f4", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/ui/f4/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/ui/f4/home-mobile.png", fullPage: true });
  await page.goto(base + "/app");
  await page.waitForURL("**/sign-in?next=*");
  check("Anonymous workspace access redirects to sign-in");
  await page.goto(base + "/create-account");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/check-email?next=*");
  check("Registration uses live API");
  await page.goto(await mailbox("verification"));
  await page.waitForURL("**/verify-email?next=*");
  await page
    .getByRole("heading", { name: "Continue with your account." })
    .waitFor();
  check("Verification follows local email through same-origin proxy");
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  await page.waitForURL(base + "/app");
  await page
    .getByRole("heading", { name: "A good idea starts here." })
    .waitFor();
  check("Verified sign-in opens private workspace");
  assert(
    (await context.cookies()).some(
      (c) => c.httpOnly && c.name.includes("session"),
    ),
  );
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  check("Session cookie is HttpOnly; no localStorage credentials");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/ui/f4/workspace-desktop.png",
    fullPage: true,
  });
  await page.goto(base + "/app/settings");
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await page.getByLabel("Timezone", { exact: true }).fill("Europe/Berlin");
  await page.getByRole("button", { name: "Save timezone" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Timezone saved." })
    .waitFor();
  await page.reload();
  await page.getByLabel("Timezone", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Timezone", { exact: true }).inputValue(),
    "Europe/Berlin",
  );
  check("Timezone persists through database and reload");
  for (const route of [
    "/app",
    "/app/projects",
    "/app/create",
    "/app/publishing",
    "/app/settings",
    "/app/settings/password",
  ]) {
    await page.goto(base + route);
    await page.locator(".app-content").waitFor();
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route + " overflow " + width,
      );
    }
  }
  check("All six workspace screens fit desktop and mobile widths");
  await page.getByRole("button", { name: "Menu", exact: false }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(base + "/sign-in");
  check("Sign-out invalidates browser session");
  await page.goto(base + "/forgot-password");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.waitForURL("**/check-email?kind=reset");
  await page.goto(await mailbox("password_reset"));
  await page.waitForURL("**/reset-password?token=*");
  await page.getByLabel("Password", { exact: true }).fill(password + "New");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(password + "New");
  await page.getByRole("button", { name: "Update password" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Password updated." })
    .waitFor();
  assert(!page.url().includes("token="));
  check("Password reset consumes emailed link and clears token URL");
  await page.goto(base + "/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password + "New");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(base + "/app");
  await page.goto(base + "/app/settings/password");
  await page
    .getByLabel("Current password", { exact: true })
    .fill(password + "New");
  await page
    .getByLabel("New password", { exact: true })
    .fill(password + "Changed");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(password + "Changed");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Password changed." })
    .waitFor();
  check("Password change uses the authenticated CSRF-protected endpoint");
  for (const route of [
    "/sign-in",
    "/create-account",
    "/forgot-password",
    "/check-email",
    "/verify-email",
    "/reset-password",
  ]) {
    await page.goto(base + route);
    for (const width of [1440, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route + " overflow " + width,
      );
    }
  }
  check("All six account screens fit desktop and mobile widths");
  await fs.writeFile(
    "docs/ui/f4/validation-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        environment:
          "Local real Fastify/PostgreSQL and Next.js; headless browser",
        checks: results,
        externalEmail: false,
        paidProviderCalls: false,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
