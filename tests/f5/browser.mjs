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
const checks = [];
const check = (n) => {
  checks.push(n);
  console.log("PASS " + n);
};
const email = "f5-" + Date.now() + "@example.test",
  password = "F5-browser-local!2026";
const topic = "Why does the spotlight effect make us feel watched?";
const title = "Psychology — spotlight effect " + Date.now();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function login(p) {
  await p.goto(base + "/sign-in");
  await p.getByLabel("Email address").fill(email);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(base + "/app");
  await p.getByRole("heading", { name: "A good idea starts here." }).waitFor();
}
async function fit(p, name, widths = [1440, 768, 390, 360]) {
  for (const width of widths) {
    await p.setViewportSize({ width, height: 950 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name + " overflow at " + width,
    );
  }
}
try {
  await page.goto(base + "/create-account");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/check-email?next=*");
  const files = await fs.readdir(".local/auth-mailbox");
  let link;
  for (const file of files) {
    const m = JSON.parse(
      await fs.readFile(".local/auth-mailbox/" + file, "utf8"),
    );
    if (m.to === email && m.kind === "verification") {
      link = m.url;
      break;
    }
  }
  assert(link);
  await page.goto(link);
  await login(page);
  check("New account can sign in to connected studio");
  await page.goto(base + "/app/create");
  await page.getByRole("heading", { name: "Create a project" }).waitFor();
  await fit(page, "creation");
  await page.getByLabel("Project title", { exact: true }).fill(title);
  await page.getByLabel("What do you want to explain?").fill(topic);
  await page.getByRole("button", { name: "Save project" }).click();
  await page.waitForURL("**/app/projects/*");
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  const projectUrl = page.url();
  await fit(page, "editor");
  check("Create project persists brief and opens responsive editor");
  await page.reload();
  await page.getByLabel("What do you want to explain?").waitFor();
  assert.equal(
    await page.getByLabel("What do you want to explain?").inputValue(),
    topic,
  );
  check("Project survives browser reload");
  const tab = await context.newPage();
  await tab.goto(projectUrl);
  await tab.getByLabel("What do you want to explain?").waitFor();
  const edited = topic + " An explanation for college students.";
  await page.getByLabel("What do you want to explain?").fill(edited);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();
  await tab
    .getByLabel("What do you want to explain?")
    .fill("A competing edit from a second browser tab.");
  await tab.getByRole("button", { name: "Save draft", exact: true }).click();
  await tab
    .getByRole("alert")
    .filter({ hasText: "changed in another tab" })
    .waitFor();
  assert.equal(
    await tab.getByLabel("What do you want to explain?").inputValue(),
    "A competing edit from a second browser tab.",
  );
  await tab.close();
  check(
    "Conflict keeps second-tab edits and never overwrites the saved winner",
  );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit saved brief" }).click();
  await page.locator(".job-item .pill").filter({ hasText: "paused" }).waitFor();
  await page
    .getByText("Waiting for the scripting stage to be connected.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Version 1", exact: false }).click();
  await page.locator(".snapshot").waitFor();
  assert((await page.locator(".snapshot").innerText()).includes(edited));
  check(
    "Submission freezes version and worker safely pauses unavailable pipeline",
  );
  await page
    .getByLabel("What do you want to explain?")
    .fill("A different psychology topic about confirmation bias.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved." }).waitFor();
  assert((await page.locator(".snapshot").innerText()).includes(edited));
  check("New draft edits leave submitted version unchanged");
  await fs.mkdir("docs/ui/f5-f6", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "docs/ui/f5-f6/project-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "docs/ui/f5-f6/project-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await page
    .locator(".job-item .pill")
    .filter({ hasText: "cancelled" })
    .waitFor();
  await page
    .getByRole("heading", { name: "3 of 3 processing slots available" })
    .waitFor();
  check("Cancellation releases reserved allowance in live UI");
  await page
    .getByRole("button", { name: "Archive project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore project", exact: true })
    .waitFor();
  assert(await page.getByLabel("What do you want to explain?").isDisabled());
  await page.goto(base + "/app/projects");
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
  await page
    .getByRole("button", { name: "Restore project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Archive project", exact: true })
    .waitFor();
  check(
    "Archive/restore updates real library and prevents archived draft edits",
  );
  await page.goto(base + "/app/projects");
  await page.getByLabel("Search projects").fill(title);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await fit(page, "library");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "docs/ui/f5-f6/library-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "docs/ui/f5-f6/library-mobile.png",
    fullPage: true,
  });
  check("Searchable project library works at desktop/tablet/mobile widths");
  const other = await browser.newContext();
  const anonymous = await other.newPage();
  await anonymous.goto(projectUrl);
  await anonymous.waitForURL("**/sign-in?next=*");
  await other.close();
  check("Direct private project URL requires a valid session");
  assert.deepEqual(errors, []);
  check("No uncaught browser errors during the workflow");
  await fs.writeFile(
    "docs/ui/f5-f6/validation-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        environment:
          "Local Next.js/Fastify/PostgreSQL with separate F6 worker; headless Edge",
        checks,
        paidProviderCalls: false,
        externalEmail: false,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
