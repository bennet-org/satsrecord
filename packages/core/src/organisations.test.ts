import { afterEach, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "./db/test-db";
import { member, organization, user } from "./db/schema";
import { createOrganisation } from "./organisations";

let db: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;
beforeEach(async () => {
  db = await createTestDb();
  const [owner] = await db
    .insert(user)
    .values({ name: "Owner", email: "owner@example.org" })
    .returning();
  userId = owner!.id;
});
afterEach(async () => {
  await db.$client.close();
});

it("concurrent same-name creates all receive unique slugs and owner memberships", async () => {
  const orgs = await Promise.all(
    Array.from({ length: 4 }, () =>
      createOrganisation(db, { name: "Same Name", userId }),
    ),
  );
  expect(orgs.map((o) => o.slug).sort()).toEqual([
    "same-name",
    "same-name-2",
    "same-name-3",
    "same-name-4",
  ]);
  expect(await db.select().from(member)).toHaveLength(4);
});

it("rolls back an organisation if creating its membership fails", async () => {
  await expect(
    createOrganisation(db, { name: "No owner", userId: randomUUID() }),
  ).rejects.toThrow();
  expect(await db.select().from(organization)).toEqual([]);
});

it("can retry a slug inside the invite's transaction and still roll back with it", async () => {
  await createOrganisation(db, { name: "Same Name", userId });
  await expect(
    db.transaction(async (tx) => {
      expect(
        (await createOrganisation(tx, { name: "Same Name", userId })).slug,
      ).toBe("same-name-2");
      throw new Error("caller failed");
    }),
  ).rejects.toThrow("caller failed");
  expect((await db.select().from(organization)).map((o) => o.slug)).toEqual([
    "same-name",
  ]);
  expect(await db.select().from(member)).toHaveLength(1);
});
