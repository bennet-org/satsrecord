import { describe, expect, it } from "vitest";
import { createTestDb } from "./db/test-db";
import { accessRequests } from "./db/schema";
import { ConsoleMailer } from "./mail/console";
import { submitAccessRequest } from "./access-requests";

const input = {
  organisation: "Example Trust",
  name: "A. Person",
  email: "a@example.org",
  country: "GB" as const,
  message: "Hello <b>there</b>",
};
const from = { name: "SatsRecord", address: "hello@satsrecord.org" };

describe("submitAccessRequest", () => {
  it("stores the row and notifies when a notify address is set", async () => {
    const db = await createTestDb();
    const mailer = new ConsoleMailer(() => {});
    const { id } = await submitAccessRequest(db, mailer, input, {
      from,
      notify: "team@satsrecord.org",
    });

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
  });

  it("stores without notifying when no notify address is set", async () => {
    const db = await createTestDb();
    const mailer = new ConsoleMailer(() => {});
    await submitAccessRequest(db, mailer, input, { from });
    const [row] = await db.select().from(accessRequests);
    expect(row!.notifiedAt).toBeNull();
    expect(mailer.sent).toHaveLength(0);
  });
});
