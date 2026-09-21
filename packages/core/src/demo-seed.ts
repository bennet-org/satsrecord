/** CLI entrypoint used only by pnpm demo, against its dedicated local database. */
import { eq } from "drizzle-orm";
import { createDb } from "./db/client";
import { createCrypto } from "./crypto";
import { seedDashboard } from "./dashboard-fixture";
import { organisationSettings, organization, user } from "./db/schema";
const url = new URL(process.env.DATABASE_URL!);
if (
  process.env.SATSRECORD_DEMO !== "true" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/satsrecord_demo"
)
  throw new Error("Demo seeding requires the dedicated local demo database");
const db = createDb(url.href);
try {
  const crypto = createCrypto({
    encryptionKey: process.env.ENCRYPTION_KEY!,
    indexKey: process.env.INDEX_KEY!,
  });
  const [owner] = await db
    .insert(user)
    .values({
      name: "Demo Owner",
      email: "demo@example.org",
      emailVerified: true,
    })
    .onConflictDoUpdate({ target: user.email, set: { name: "Demo Owner" } })
    .returning();
  let [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, "demo-harbour-aid"));
  if (!org) {
    const seeded = await seedDashboard(db, crypto, owner!.id);
    [org] = await db
      .update(organization)
      .set({ slug: "demo-harbour-aid" })
      .where(eq(organization.id, seeded.orgId))
      .returning();
    await db
      .update(organisationSettings)
      .set({
        allowedOrigins: ["http://localhost:8087"],
        notificationMode: "per-donation",
      })
      .where(eq(organisationSettings.organisationId, org!.id));
  }
  process.stdout.write(JSON.stringify({ orgId: org!.id }) + "\n");
} finally {
  await db.$client.end();
}
