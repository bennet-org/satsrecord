import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // DDL cannot go through Neon's pooler; the app keeps the pooled DATABASE_URL.
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "postgres://satsrecord:satsrecord@localhost:5432/satsrecord",
  },
  strict: true,
  verbose: true,
});
