import { spawnSync } from "node:child_process";

// Never migrate a database from a preview, branch deploy or unknown context.
// PRs can edit this script: production-only secret scoping in Netlify is still required.
if (process.env.CONTEXT !== "production") {
  console.error(
    "Netlify builds are production-only. Preview and branch builds are disabled; see docs/deployment.md.",
  );
  process.exit(1);
}

for (const args of [
  ["--filter", "@satsrecord/core", "db:migrate"],
  ["--filter", "@satsrecord/web", "build"],
]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.error) {
    console.error("Could not start pnpm:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
