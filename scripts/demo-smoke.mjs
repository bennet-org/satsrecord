// Run with pnpm demo already running. Exercises its isolated fixture, never a real organisation.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const base = "http://localhost:4327";
const keys = JSON.parse(await readFile(".demo/keys.json", "utf8"));
const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext({
    httpCredentials: { username: "outbox", password: keys.DEV_OUTBOX_PASSWORD },
  });
  const dashboard = await context.newPage();
  await dashboard.goto(`${base}/login`);
  await dashboard.getByLabel("Email", { exact: true }).fill("demo@example.org");
  await dashboard
    .getByRole("button", { name: "Email me a sign-in link" })
    .click();
  await dashboard.getByText("Check your email.", { exact: true }).waitFor();
  const outbox = await context.newPage();
  await outbox.goto(`${base}/dev/outbox`);
  const magic = await outbox
    .locator('a[href*="/api/auth/magic-link/verify"]')
    .first()
    .getAttribute("href");
  await dashboard.goto(magic);
  await dashboard.goto(`${base}/app/settings`);
  await dashboard
    .locator('[name="notificationMode"]')
    .selectOption("per-donation");
  await dashboard.locator('[name="notificationEmail"]').fill("");
  await dashboard.getByRole("button", { name: "Save notifications" }).click();
  await dashboard.getByText("Settings saved.").waitFor();
  const donation = await context.newPage();
  await donation.goto("http://localhost:8087");
  const widget = donation.locator("satsrecord-donate");
  await widget.locator('[name="name"]').fill("Demo Donor");
  await widget.locator('[name="email"]').fill("donor@example.org");
  await widget.getByRole("button", { name: "Get donation address" }).click();
  await widget.getByRole("button", { name: "Copy address" }).waitFor();
  await dashboard.goto(`${base}/dev/donations`);
  assert.equal(
    (
      await context.request.post(`${base}/dev/donations`, {
        form: { amountSats: "100000" },
        headers: { origin: "http://untrusted.example" },
      })
    ).status(),
    403,
  );
  await dashboard
    .getByRole("button", { name: "Simulate donation", exact: true })
    .click();
  await dashboard
    .getByText("Acknowledgement sent.", { exact: false })
    .waitFor();
  await widget
    .getByRole("heading", { name: "Received, thank you." })
    .waitFor({ timeout: 45000 });
  await outbox.reload();
  assert(
    (await outbox.locator("body").innerText()).includes(
      "Donation received · Demo · Harbour Aid",
    ),
  );
  await dashboard.getByRole("link", { name: "View donation" }).click();
  assert((await dashboard.locator("body").innerText()).includes("48.99"));
  await dashboard.goto(`${base}/app/settings`);
  await dashboard.locator('[name="notificationMode"]').selectOption("daily");
  await dashboard
    .locator('[name="notificationEmail"]')
    .fill("finance@example.org");
  await dashboard.getByRole("button", { name: "Save notifications" }).click();
  await dashboard.getByText("Settings saved.").waitFor();
  await widget.getByRole("button", { name: "Make another donation" }).click();
  await widget.getByRole("button", { name: "Get donation address" }).click();
  const anonymous = widget.getByRole("button", {
    name: "Continue without email",
  });
  if (await anonymous.isVisible()) await anonymous.click();
  await widget.getByRole("button", { name: "Copy address" }).waitFor();
  await dashboard.goto(`${base}/dev/donations`);
  await dashboard
    .getByRole("button", { name: "Simulate donation", exact: true })
    .click();
  await dashboard.getByRole("link", { name: "View donation" }).waitFor();
  await dashboard
    .getByRole("button", { name: "Send queued notifications now" })
    .click();
  await dashboard.getByText("1 queued donation notices delivered.").waitFor();
  await outbox.reload();
  assert(
    (await outbox.locator("body").innerText()).includes(
      "Daily donation digest",
    ),
  );
  const unauthed = await browser.newContext();
  assert.equal(
    (
      await unauthed.request.post(`${base}/api/internal/notifications`, {
        headers: { "Content-Type": "application/json" },
      })
    ).status(),
    404,
  );
  assert.equal(
    (
      await context.request.post(`${base}/api/internal/notifications`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keys.NOTIFICATION_CRON_SECRET}`,
        },
      })
    ).status(),
    200,
  );
  for (const type of ["donations", "manifest"]) {
    const response = await context.request.get(
      `${base}/app/exports?download=${type}`,
    );
    assert.equal(response.status(), 200);
    assert((response.headers()["content-type"] ?? "").includes("text/csv"));
    assert(
      (await response.text()).includes(
        type === "donations" ? "fixed-demo-rate" : "recommended_gap_limit",
      ),
    );
  }
  await mkdir("/tmp/satsrecord-demo", { recursive: true });
  await dashboard.screenshot({
    path: "/tmp/satsrecord-demo/simulation-desktop.png",
    fullPage: true,
  });
  await dashboard.setViewportSize({ width: 390, height: 844 });
  await dashboard.screenshot({
    path: "/tmp/satsrecord-demo/simulation-phone.png",
    fullPage: true,
  });
  assert(
    await dashboard.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    "Demo smoke passed: login, issuance, simulation, widget received, acknowledgement, owner notice, digest, route guards, desktop and phone.",
  );
} finally {
  await browser.close();
}
