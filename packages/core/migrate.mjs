// Applies ./drizzle to DATABASE_URL. The container entrypoint runs this; Netlify runs drizzle-kit
// instead, because its DDL needs the unpooled URL that drizzle.config.ts picks up. Plain JavaScript
// and shipped inside the package, so it runs straight out of node_modules with no build step.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = drizzle(process.env.DATABASE_URL);
await migrate(db, {
  migrationsFolder: fileURLToPath(new URL("./drizzle", import.meta.url)),
});
await db.$client.end();
console.log("[migrate] schema is up to date");
