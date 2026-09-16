// Full-page screenshots of the built site at desktop and phone widths, using the system Chrome.
// Usage: node scripts/shots.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:4399";
const out = process.argv[3] ?? "shots";
mkdirSync(out, { recursive: true });

const targets = [
  { path: "/", name: "home" },
  { path: "/request-access", name: "request-access" },
];
const widths = [1440, 400];

const browser = await chromium.launch({ channel: "chrome" });
for (const w of widths) {
  const page = await browser.newPage({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 1,
  });
  for (const t of targets) {
    await page.goto(base + t.path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) console.log(`OVERFLOW ${t.path} at ${w}px: scrollWidth ${sw}`);
    await page.screenshot({
      path: `${out}/${t.name}-${w}.png`,
      fullPage: true,
    });
  }
  await page.close();
}
await browser.close();
console.log("done");
