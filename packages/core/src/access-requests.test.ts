import { describe, expect, it } from "vitest";
import { createTestDb } from "./db/test-db";
import { accessRequests, widgetRateLimits } from "./db/schema";
import { ConsoleMailer } from "./mail/console";
import {
  AccessRequestLimitError,
  submitAccessRequest,
} from "./access-requests";

const input = {
  organisation: "Example Trust",
  name: "A. Person",
  email: "a@example.org",
  country: "GB" as const,
  message: "Hello <b>there</b>",
};
const from = { name: "SatsRecord", address: "hello@satsrecord.org" };
const limit = {
  ip: "192.0.2.1",
  secret: "test-only-hmac-secret",
  now: new Date("2026-09-21T12:00:00Z"),
};

describe("submitAccessRequest", () => {
  it("stores the row and notifies when a notify address is set", async () => {
    const db = await createTestDb();
    const mailer = new ConsoleMailer(() => {});
    const { id } = await submitAccessRequest(
      db,
      mailer,
      input,
      {
        from,
        notify: "team@satsrecord.org",
      },
      limit,
    );

    const rows = await db.select().from(accessRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      organisation: "Example Trust",
      status: "new",
      website: null,
    });
    expect(rows[0]!.notifiedAt).toBeInstanceOf(Date);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: "team@satsrecord.org",
      replyTo: "a@example.org",
      subject: "Access request: Example Trust",
    });
    expect(mailer.sent[0]!.html).toContain("&lt;b&gt;there&lt;/b&gt;");
    await db.$client.close();
  });

  it("stores without notifying when no notify address is set", async () => {
    const db = await createTestDb();
    const mailer = new ConsoleMailer(() => {});
    await submitAccessRequest(db, mailer, input, { from }, limit);
    const [row] = await db.select().from(accessRequests);
    expect(row!.notifiedAt).toBeNull();
    expect(mailer.sent).toHaveLength(0);
    await db.$client.close();
  });
});

it("limits concurrent submissions before storing or mailing, and resets next window", async () => {
  const db = await createTestDb();
  const mailer = new ConsoleMailer(() => {});
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      submitAccessRequest(
        db,
        mailer,
        { ...input, email: `person${i}@example.org` },
        { from, notify: "team@example.org" },
        limit,
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  for (const r of results)
    if (r.status === "rejected")
      expect(r.reason).toBeInstanceOf(AccessRequestLimitError);
  expect(await db.select().from(accessRequests)).toHaveLength(5);
  expect(mailer.sent).toHaveLength(5);
  const counters = await db.select().from(widgetRateLimits);
  expect(counters.every((c) => /^[a-f0-9]{64}$/.test(c.key))).toBe(true);
  await submitAccessRequest(
    db,
    mailer,
    input,
    { from },
    { ...limit, now: new Date("2026-09-21T13:00:00Z") },
  );
  await db.$client.close();
});

it("normalises email for its daily quota even when the IP changes", async () => {
  const db = await createTestDb();
  const mailer = new ConsoleMailer(() => {});
  for (let i = 0; i < 3; i++)
    await submitAccessRequest(
      db,
      mailer,
      input,
      { from },
      { ...limit, ip: `192.0.2.${i}` },
    );
  await expect(
    submitAccessRequest(
      db,
      mailer,
      { ...input, email: "A@EXAMPLE.ORG" },
      { from },
      { ...limit, ip: "192.0.2.99" },
    ),
  ).rejects.toBeInstanceOf(AccessRequestLimitError);
  expect(await db.select().from(accessRequests)).toHaveLength(3);
  await db.$client.close();
});
