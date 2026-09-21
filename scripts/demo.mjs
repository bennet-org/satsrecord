import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const compose = ["compose", "-p", "satsrecord-demo", "-f", "compose.demo.yaml"];
function run(command, args, env, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}
if (process.argv.includes("--stop")) {
  await run("docker", [...compose, "stop"], process.env);
  process.exit(0);
}
await mkdir(".demo", { recursive: true, mode: 0o700 });
let keys;
try {
  keys = JSON.parse(await readFile(".demo/keys.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  keys = Object.fromEntries(
    [
      "BETTER_AUTH_SECRET",
      "ENCRYPTION_KEY",
      "INDEX_KEY",
      "DEV_OUTBOX_PASSWORD",
      "NOTIFICATION_CRON_SECRET",
    ].map((key) => [key, randomBytes(32).toString("base64")]),
  );
  await writeFile(".demo/keys.json", JSON.stringify(keys, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
}
const env = {
  ...process.env,
  ...keys,
  DATABASE_URL:
    "postgres://satsrecord:satsrecord@localhost:5437/satsrecord_demo",
  DATABASE_URL_UNPOOLED:
    "postgres://satsrecord:satsrecord@localhost:5437/satsrecord_demo",
  APP_URL: "http://localhost:4327",
  SATSRECORD_DEMO: "true",
  ASTRO_DEV_BACKGROUND: "1",
  NODE_ENV: "development",
  SIMULATE_DONATIONS: "true",
  DEV_OUTBOX: "true",
  OPEN_SIGNUP: "true",
  RESEND_API_KEY: "",
  MAIL_FROM: "SatsRecord Demo <demo@example.org>",
  NOTIFY_EMAIL: "",
  OPERATOR_EMAILS: "demo@example.org",
  NETLIFY: "",
};
let app, embed, timer;
let closing = false;
async function close(code = 0) {
  if (closing) {
    clearInterval(timer);
    return;
  }
  closing = true;
  clearInterval(timer);
  embed?.close();
  if (app?.pid) {
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {}
  }
  process.exitCode = code;
}
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
try {
  await run("docker", [...compose, "up", "-d", "--wait", "db"], env);
  await run(
    "pnpm",
    ["--filter", "@satsrecord/core", "exec", "drizzle-kit", "migrate"],
    env,
  );
  const seeded = JSON.parse(
    (
      await run(
        "pnpm",
        ["exec", "tsx", "packages/core/src/demo-seed.ts"],
        env,
        true,
      )
    ).trim(),
  );
  embed = createServer((_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Harbour Aid demo</title><style>body{max-width:650px;margin:40px auto;padding:20px;font:18px system-ui;background:#f5f7fa;color:#293442}h1{font-size:32px}</style><h1>Help Harbour Aid</h1><p>Demo only. Never send real funds to this public test-vector wallet. Use “Simulate a donation” in the dashboard.</p><script type="module" src="http://localhost:4327/widget/v1.js"></script><satsrecord-donate org="${seeded.orgId}" api="http://localhost:4327"></satsrecord-donate></html>`,
    );
  });
  await new Promise((resolve, reject) => {
    embed.once("error", reject);
    embed.listen(8087, "127.0.0.1", resolve);
  });
  app = spawn(
    "pnpm",
    [
      "--filter",
      "@satsrecord/web",
      "dev",
      "--ignore-lock",
      "--host",
      "127.0.0.1",
      "--port",
      "4327",
    ],
    { env, stdio: "inherit", detached: true },
  );
  app.on("error", (error) => {
    console.error(error.message);
    close(1);
  });
  app.on("exit", (code) => {
    if (!closing) close(code ?? 1);
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (closing) throw new Error("Demo server exited before startup completed");
    try {
      if ((await fetch(`${env.APP_URL}/login`)).ok) break;
    } catch {}
    if (attempt === 119) throw new Error("Demo web server did not start");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const deliver = async () => {
    try {
      const response = await fetch(
        `${env.APP_URL}/api/internal/notifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keys.NOTIFICATION_CRON_SECRET}`,
          },
        },
      );
      if (!response.ok)
        console.error("Notification delivery will retry next minute.");
    } catch {}
  };
  timer = setInterval(deliver, 60_000);
  console.log(
    `\nDemo ready\nDashboard: ${env.APP_URL}/login — sign in as demo@example.org\nMail: ${env.APP_URL}/dev/outbox — username outbox, password ${keys.DEV_OUTBOX_PASSWORD}\nDonation page: http://localhost:8087\nWalkthrough: docs/demo.md\nCtrl-C stops the app. pnpm demo:stop stops the demo database; records and keys persist.\n`,
  );
} catch (error) {
  console.error(error.message);
  await close(1);
}
