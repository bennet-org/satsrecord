// End-to-end widget acceptance against the production server and an isolated local database.
// Run pnpm build, then node scripts/widget-smoke.mjs. Requires local Postgres and system Chrome.
import assert from "node:assert/strict";
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import pg from "../packages/core/node_modules/pg/lib/index.js";
import { chromium } from "playwright";
const base = "http://127.0.0.1:4325",
  embedOrigin = "http://127.0.0.1:8088";
const connection = new URL(
  process.env.WIDGET_TEST_DATABASE_URL ||
    "postgres://satsrecord:satsrecord@localhost:5432/satsrecord",
);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname),
  "Use a local test database server.",
);
const admin = new pg.Client({ connectionString: connection.href });
const database = `satsrecord_widget_test_${process.pid}`;
let client, app, embed, browser;
let appOutput = "";
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  connection.pathname = `/${database}`;
  client = new pg.Client({ connectionString: connection.href });
  await client.connect();
  for (const file of (await readdir("packages/core/drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await client.query(await readFile(`packages/core/drizzle/${file}`, "utf8"));
  const key = randomBytes(32),
    indexKey = randomBytes(32),
    orgId = randomUUID();
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const descriptor =
    "wpkh(xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V/0/*)";
  const ciphertext = Buffer.concat([cipher.update(descriptor), cipher.final()]);
  const encrypted = [
    "v1",
    iv.toString("base64"),
    ciphertext.toString("base64"),
    cipher.getAuthTag().toString("base64"),
  ].join(".");
  await client.query(
    "INSERT INTO organization(id,name,slug) VALUES($1,$2,$3)",
    [orgId, "Harbour Aid", "phase5-test"],
  );
  await client.query(
    "INSERT INTO organisation_settings(organisation_id,completed_at,allowed_origins,sender_name,reply_to) VALUES($1,now(),$2,$3,$4)",
    [orgId, [embedOrigin], "Harbour Aid", "hello@example.org"],
  );
  await client.query(
    "INSERT INTO descriptors(organisation_id,descriptor_enc,script_type,network,label) VALUES($1,$2,$3,$4,$5)",
    [orgId, encrypted, "wpkh", "mainnet", "TEST"],
  );
  app = spawn(process.execPath, ["apps/web/dist/server/entry.mjs"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "4325",
      DATABASE_URL: connection.href,
      ENCRYPTION_KEY: key.toString("base64"),
      INDEX_KEY: indexKey.toString("base64"),
      APP_URL: base,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      RESEND_API_KEY: "",
      DEV_OUTBOX: "true",
      OPEN_SIGNUP: "true",
      SIMULATE_DONATIONS: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (data) => {
    appOutput += data;
  });
  app.stderr.on("data", (data) => {
    appOutput += data;
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert((await fetch(base)).ok, "Production app starts");
  embed = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Charity website test</title><style>body{margin:0;background:#e9e8e3;font-family:system-ui}main{max-width:1100px;padding:32px 20px;margin:auto}.presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:28px}h1{font-size:22px}h2{font-size:14px} .warning{margin-bottom:30px}</style><main><h1>Harbour Aid · widget acceptance</h1><p class="warning">Test wallet — never send funds to these addresses.</p><script defer src="${base}/widget/v1.js"></script><div class="presets">${["satsrecord", "minimal", "custom"].map((p) => `<section><h2>${p}</h2><satsrecord-donate org="${orgId}" api="${base}" preset="${p}" ></satsrecord-donate></section>`).join("")}</div></main></html>`,
    );
  });
  embed.listen(8088, "127.0.0.1");
  await once(embed, "listening");
  browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(embedOrigin);
  const widget = page.locator("satsrecord-donate").first();
  await widget.getByRole("button", { name: "Get donation address" }).waitFor();
  assert.equal(
    (await client.query("SELECT count(*) FROM addresses")).rows[0].count,
    "0",
  );
  assert.equal(await widget.locator('[name="marketing"]').isChecked(), false);
  await mkdir("/tmp/satsrecord-widget-design", { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  const brandFonts = await page.evaluate(async () =>
    (await document.fonts.load('800 16px "SatsRecord Widget"')).map((f) => ({
      family: f.family,
      status: f.status,
    })),
  );
  assert(
    brandFonts.some((f) => f.status === "loaded"),
    `Branded font loaded: ${JSON.stringify(brandFonts)}`,
  );
  await page.screenshot({
    path: "/tmp/satsrecord-widget-design/presets-desktop.png",
    fullPage: true,
  });
  assert(
    await widget
      .getByRole("link", { name: "SatsRecord", exact: true })
      .isVisible(),
    "Branding is shown by default",
  );
  await widget.locator('[name="name"]').fill("Name without email");
  const formHeight = (await widget.boundingBox()).height;
  await widget.getByRole("button", { name: "Get donation address" }).click();
  await widget
    .getByRole("heading", { name: "Continue without email?" })
    .waitFor();
  assert.equal(
    (await client.query("SELECT count(*) FROM addresses")).rows[0].count,
    "0",
    "Confirmation does not issue an address",
  );
  assert(
    Math.abs((await widget.boundingBox()).height - formHeight) < 1,
    "Anonymous confirmation preserves widget height",
  );
  await widget.screenshot({
    path: "/tmp/satsrecord-widget-design/anonymous.png",
  });
  await widget.getByRole("button", { name: "Add my email" }).click();
  assert.equal(
    await widget.locator('[name="name"]').inputValue(),
    "Name without email",
  );
  assert(
    await widget
      .locator('[name="email"]')
      .evaluate((el) => el === el.getRootNode().activeElement),
  );
  await page.route("**/api/widget/**", async (route) => {
    if (route.request().method() === "POST")
      await new Promise((resolve) => setTimeout(resolve, 450));
    await route.continue();
  });
  const submitControl = widget.getByRole("button", {
    name: "Get donation address",
  });
  const beforeHover = await submitControl.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await submitControl.hover();
  await page.waitForFunction((previous) => {
    const button = document
      .querySelector("satsrecord-donate")
      .shadowRoot.querySelector('button[type="submit"]');
    return getComputedStyle(button).backgroundColor !== previous;
  }, beforeHover);
  await widget.locator('[name="name"]').fill("Test Donor");
  await widget.locator('[name="email"]').fill("donor@example.org");
  await widget.getByRole("button", { name: "Get donation address" }).click();
  await widget.getByRole("button", { name: "Preparing address…" }).waitFor();
  assert.equal(
    await widget.locator('button[aria-busy="true"]').isDisabled(),
    true,
  );
  await widget.getByRole("button", { name: "Copy address" }).waitFor();
  const address = await widget.locator(".address").textContent();
  assert.equal(address, "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
  assert.equal(
    await widget
      .getByRole("link", { name: "Open in wallet" })
      .getAttribute("href"),
    `bitcoin:${address}`,
  );
  assert.equal(await widget.locator(".qr > svg").count(), 1);
  assert.equal(
    await widget.locator(".qr svg svg").count(),
    1,
    "Bitcoin logo is inside QR",
  );
  await widget
    .locator(".qr")
    .screenshot({ path: "/tmp/satsrecord-widget-design/qr.png" });
  await widget.getByRole("button", { name: "Copy address" }).click();
  await widget.getByRole("button", { name: "Copied!", exact: true }).waitFor();
  await widget
    .getByRole("button", { name: "Copy address", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    address,
  );
  await page.reload();
  await widget.getByRole("button", { name: "Copy address" }).waitFor();
  assert.equal(await widget.locator(".address").textContent(), address);
  assert.equal(
    (await client.query("SELECT count(*) FROM addresses")).rows[0].count,
    "1",
  );
  assert(
    !JSON.stringify(await page.evaluate(() => ({ ...localStorage }))).includes(
      "donor@example.org",
    ),
  );
  await page.screenshot({
    path: "/tmp/satsrecord-widget-design/address-desktop.png",
    fullPage: true,
  });
  const outbox = await context.newPage();
  await outbox.goto(`${base}/dev/outbox`);
  const confirmation = await outbox
    .locator('a[href*="/donor/verify#"]')
    .getAttribute("href");
  assert(confirmation);
  await outbox.goto(confirmation);
  assert.equal(
    (await client.query("SELECT attribution FROM donors")).rows[0].attribution,
    "claimed",
  );
  assert.equal(
    (await outbox.locator("#verification-token").inputValue()).length,
    64,
  );
  const verifyResponse = outbox.waitForResponse(
    (r) => r.request().method() === "POST",
  );
  await outbox
    .getByRole("button", { name: "Confirm my email address" })
    .click();
  const verificationResponse = await verifyResponse;
  assert.equal(verificationResponse.status(), 200);
  await outbox.getByRole("heading", { name: "Email confirmed." }).waitFor();
  assert.equal(
    (await client.query("SELECT attribution FROM donors")).rows[0].attribution,
    "email_confirmed",
  );
  const addressId = (await client.query("SELECT id FROM addresses")).rows[0].id;
  await client.query(
    "INSERT INTO settlements(organisation_id,address_id,kind,txid,vout,amount_sats,first_seen_at,status) VALUES($1,$2,'onchain',$3,0,1234,now(),'confirmed')",
    [orgId, addressId, "a".repeat(64)],
  );
  await widget
    .getByRole("heading", { name: "Received, thank you." })
    .waitFor({ timeout: 25_000 });
  await page.reload();
  await widget.getByRole("heading", { name: "Received, thank you." }).waitFor();
  await page.screenshot({
    path: "/tmp/satsrecord-widget-design/received-desktop.png",
    fullPage: true,
  });
  await widget.getByRole("button", { name: "Make another donation" }).click();
  await widget.getByRole("button", { name: "Get donation address" }).click();
  await widget
    .getByRole("button", { name: "Continue without email", exact: true })
    .click();
  await widget.getByRole("button", { name: "Copy address" }).waitFor();
  assert.notEqual(await widget.locator(".address").textContent(), address);
  // Real dashboard session, then exercise preset controls and save without issuing addresses.
  const dashboard = await context.newPage();
  await dashboard.goto(`${base}/login`);
  await dashboard
    .getByLabel("Email", { exact: true })
    .fill("owner@example.org");
  await dashboard
    .getByRole("button", { name: "Email me a sign-in link" })
    .click();
  await dashboard.getByText("Check your email.", { exact: true }).waitFor();
  await outbox.goto(`${base}/dev/outbox`);
  const magicLink = await outbox
    .locator('a[href*="/api/auth/magic-link/verify"]')
    .first()
    .getAttribute("href");
  await dashboard.goto(magicLink);
  const userId = (
    await client.query('SELECT id FROM "user" WHERE email=$1', [
      "owner@example.org",
    ])
  ).rows[0].id;
  await client.query(
    "INSERT INTO member(organization_id,user_id,role) VALUES($1,$2,'owner')",
    [orgId, userId],
  );
  await dashboard.goto(`${base}/app/widget`);
  await dashboard.locator('input[value="custom"]').check();
  assert(await dashboard.locator("#custom-colours").isVisible());
  assert.equal(
    await dashboard.locator('input[name="accent"]').inputValue(),
    "#d5e4f8",
  );
  assert.equal(
    await dashboard.locator('input[name="background"]').inputValue(),
    "#fafcff",
  );
  assert(await dashboard.locator('[name="showBranding"]').isChecked());
  await dashboard.locator('[name="showBranding"]').uncheck();
  assert.equal(
    await dashboard
      .locator("satsrecord-donate")
      .getByRole("link", { name: "SatsRecord", exact: true })
      .count(),
    0,
  );
  await dashboard.locator('[name="showBranding"]').check();
  assert(
    await dashboard
      .locator("satsrecord-donate")
      .getByRole("link", { name: "SatsRecord", exact: true })
      .isVisible(),
  );
  await dashboard.locator('[name="showBranding"]').uncheck();
  for (const [key, value] of Object.entries({
    accent: "#244f46",
    background: "#f3f7f4",
    text: "#16352d",
    buttonText: "#ffffff",
  }))
    await dashboard.locator(`input[name="${key}"]`).fill(value);
  await dashboard
    .locator('input[name="description"]')
    .fill("Help Harbour Aid support people in need.");
  await dashboard
    .locator('input[name="heading"]')
    .fill("A little bitcoin. A lasting change.");
  await dashboard.getByRole("button", { name: "Save customisation" }).click();
  await dashboard.getByRole("button", { name: "Done", exact: true }).waitFor();
  assert(
    (await dashboard.locator("#install-snippet").inputValue()).includes(
      'preset="custom"',
    ),
  );
  await dashboard.reload();
  assert(await dashboard.locator('input[value="custom"]').isChecked());
  assert.equal(
    await dashboard.locator('[name="showBranding"]').isChecked(),
    false,
  );
  assert(
    (await dashboard.locator("#install-snippet").inputValue()).includes(
      'show-branding="false"',
    ),
  );
  assert.equal(
    await dashboard.locator('input[name="accent"]').inputValue(),
    "#244f46",
  );
  assert.equal(
    await dashboard.locator('input[name="description"]').inputValue(),
    "Help Harbour Aid support people in need.",
  );
  assert(
    (await dashboard.locator("#install-snippet").inputValue()).includes(
      "--sr-button-text:#ffffff",
    ),
  );
  const preview = dashboard.locator("satsrecord-donate");
  assert.equal(
    await preview.evaluate((el) => el.style.getPropertyValue("--sr-accent")),
    "#244f46",
  );
  await preview
    .getByRole("heading", { name: "A little bitcoin. A lasting change." })
    .waitFor();
  for (const width of [1440, 390]) {
    await dashboard.setViewportSize({ width, height: 1000 });
    await dashboard.screenshot({
      path: `/tmp/satsrecord-widget-design/dashboard-${width}.png`,
      fullPage: true,
    });
    assert(
      (await dashboard.evaluate(() => document.documentElement.scrollWidth)) <=
        width,
      `Dashboard has no overflow at ${width}`,
    );
    for (const state of ["form", "anonymous", "address", "received"]) {
      await dashboard.locator("#preview-state").selectOption(state);
      assert.equal(await preview.getAttribute("preview-state"), state);
      if (state === "anonymous") {
        const intro = dashboard.locator('input[name="description"]');
        await intro.fill("Help Harbour Aid support people in need.");
        assert(
          await intro.evaluate((el) => el === document.activeElement),
          "Preview does not steal editor focus",
        );
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.reload();
  await widget.getByRole("button", { name: "Copy address" }).waitFor();
  assert(
    (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390,
  );
  await page.screenshot({
    path: "/tmp/satsrecord-widget-design/address-phone.png",
    fullPage: true,
  });
  assert.equal(
    await widget.getByRole("link", { name: "SatsRecord", exact: true }).count(),
    0,
    "Saved branding visibility reaches the embed",
  );
  // Same-origin self-hosted embedding, including blocked localStorage.
  await client.query(
    "UPDATE organisation_settings SET allowed_origins=$2 WHERE organisation_id=$1",
    [orgId, [embedOrigin, base]],
  );
  const sameOrigin = await context.newPage();
  await sameOrigin.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("storage disabled");
    };
    Storage.prototype.setItem = () => {
      throw new Error("storage disabled");
    };
  });
  await sameOrigin.route(`${base}/embed-test`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<script defer src="${base}/widget/v1.js"></script><satsrecord-donate org="${orgId}" api="${base}"></satsrecord-donate>`,
    }),
  );
  await sameOrigin.goto(`${base}/embed-test`);
  await sameOrigin
    .getByRole("button", { name: "Get donation address" })
    .click();
  await sameOrigin.route("**/api/widget/**", async (route) => {
    await sameOrigin.unroute("**/api/widget/**");
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Please try again." }),
    });
  });
  await sameOrigin
    .getByRole("button", { name: "Continue without email", exact: true })
    .click();
  await sameOrigin
    .getByRole("alert")
    .filter({ hasText: "Please try again." })
    .waitFor();
  await sameOrigin
    .getByRole("button", { name: "Continue without email", exact: true })
    .click();
  await sameOrigin.getByRole("button", { name: "Copy address" }).waitFor();
  await sameOrigin.close();
  // Real Postgres row locks must serialize concurrent retries too.
  const retryToken = randomBytes(32).toString("hex");
  const post = () =>
    fetch(`${base}/api/widget/${orgId}`, {
      method: "POST",
      headers: { Origin: embedOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        token: retryToken,
        name: "",
        email: "",
        marketing: false,
      }),
    }).then(async (r) => {
      assert.equal(r.status, 200);
      return r.json();
    });
  const retried = await Promise.all([post(), post(), post()]);
  assert.equal(new Set(retried.map((r) => r.address)).size, 1);
  // Exercise logo QR rendering for the other supported address shapes without issuing funds.
  for (const [kind, qrAddress] of Object.entries({
    taproot: "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
    wrapped: "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
  })) {
    const qrPage = await context.newPage();
    await qrPage.route("**/api/widget/**", (route) =>
      route.request().headers().authorization
        ? route.fulfill({
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": embedOrigin },
            body: JSON.stringify({
              address: qrAddress,
              funded: false,
              emailStatus: "none",
            }),
          })
        : route.continue(),
    );
    await qrPage.goto(embedOrigin);
    const qrWidget = qrPage.locator("satsrecord-donate").first();
    await qrWidget.getByRole("button", { name: "Copy address" }).waitFor();
    await qrWidget
      .locator(".qr")
      .screenshot({ path: `/tmp/satsrecord-widget-design/qr-${kind}.png` });
    await qrPage.close();
  }
  // Browser denies a website removed from the allowlist.
  await client.query(
    "UPDATE organisation_settings SET allowed_origins='{}' WHERE organisation_id=$1",
    [orgId],
  );
  await page.reload();
  await widget.getByRole("alert").waitFor();
  assert.equal(
    await widget.getByRole("button", { name: "Copy address" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: cross-origin embedding, real derivation, email + verification, copy + BIP21 + QR, restore, funded + new donation, dashboard presets + save, mobile overflow, origin revocation. Screenshots: /tmp/satsrecord-widget-design",
  );
} catch (error) {
  console.error(error);
  // Server logs contain test-only email links; keep output concise.
  console.error(
    appOutput
      .split("\n")
      .filter((line) => /Error|error|listening/.test(line))
      .slice(-10)
      .join("\n"),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (embed) {
    embed.closeAllConnections();
    await new Promise((r) => embed.close(r));
  }
  if (app && app.exitCode === null) {
    app.kill("SIGTERM");
    await once(app, "exit");
  }
  await client?.end();
  await admin
    .query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    .catch(() => {});
  await admin.end();
}
