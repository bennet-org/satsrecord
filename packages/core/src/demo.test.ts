import { afterEach, beforeEach, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "./db/test-db";
import { createCrypto } from "./crypto";
import { ConsoleMailer } from "./mail";
import { seedDashboard } from "./dashboard-fixture";
import { simulateDonation } from "./demo";
import { issueWidgetAddress, widgetSession } from "./widget";
import { SingleSigDeriver } from "./bitcoin";
import {
  acknowledgements,
  donors,
  emailLog,
  organisationSettings,
  settlements,
  submissions,
  valuations,
} from "./db/schema";

const crypto = createCrypto({
  encryptionKey: randomBytes(32).toString("base64"),
  indexKey: randomBytes(32).toString("base64"),
});
let db: Awaited<ReturnType<typeof createTestDb>>;
let mailer: ConsoleMailer;
let orgId: string;
let submissionId: string;
let token: string;
const origin = "http://localhost:8080";
const services = () => ({
  db,
  crypto,
  mailer,
  from: { address: "hello@satsrecord.org" },
});
const input = () => ({
  enabled: true,
  role: "owner",
  organisationId: orgId,
  submissionId,
  amountSats: 100000,
});
beforeEach(async () => {
  db = await createTestDb();
  mailer = new ConsoleMailer(() => {});
  ({ orgId } = await seedDashboard(db, crypto));
  await db
    .update(organisationSettings)
    .set({ allowedOrigins: [origin] })
    .where(eq(organisationSettings.organisationId, orgId));
  token = randomBytes(32).toString("hex");
  await issueWidgetAddress(
    {
      ...services(),
      appUrl: "http://localhost:4321",
      deriver: new SingleSigDeriver(),
    },
    orgId,
    origin,
    "127.0.0.1",
    {
      token,
      name: "Example Donor",
      email: "donor@example.org",
      marketing: false,
    },
  );
  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.organisationId, orgId));
  submissionId = rows.find((s) => s.origin === origin)!.id;
});
afterEach(async () => {
  await db.$client.close();
});

it("records a fixed-rate valuation, acknowledgement and received widget state, without duplicate sends", async () => {
  expect((await widgetSession(db, orgId, origin, token))!.funded).toBe(false);
  const results = await Promise.all([
    simulateDonation(services(), input()),
    simulateDonation(services(), input()),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]!.email).toBe("sent");
  const id = results[0]!.settlementId;
  expect(
    (
      await db.select().from(valuations).where(eq(valuations.settlementId, id))
    )[0],
  ).toMatchObject({
    currency: "GBP",
    amount: "48.99",
    rate: "48992.000000",
    method: "fixed-demo-rate",
    confirmationsAtValuation: 1,
  });
  expect(
    await db
      .select()
      .from(acknowledgements)
      .where(eq(acknowledgements.settlementId, id)),
  ).toHaveLength(1);
  expect(
    mailer.sent.filter(
      (m) => m.templateVersion === "donation-acknowledgement@1",
    ),
  ).toHaveLength(1);
  expect(mailer.sent.at(-1)).toMatchObject({
    to: "donor@example.org",
    replyTo: "hello@example.org",
  });
  expect(mailer.sent.at(-1)!.text).toContain("DEMONSTRATION ONLY");
  expect(mailer.sent.at(-1)!.text).toContain("claimed, email not verified");
  expect((await widgetSession(db, orgId, origin, token))!.funded).toBe(true);
});

it("keeps accounting and received state on mail failure, and retries delivery", async () => {
  const failing = {
    ...services(),
    mailer: {
      name: "failed",
      send: async () => {
        throw new Error("Unavailable");
      },
    },
  };
  const first = await simulateDonation(failing, input());
  expect(first.email).toBe("failed");
  expect((await widgetSession(db, orgId, origin, token))!.funded).toBe(true);
  expect(
    await db
      .select()
      .from(acknowledgements)
      .where(eq(acknowledgements.settlementId, first.settlementId)),
  ).toHaveLength(0);
  const retry = await simulateDonation(services(), input());
  expect(retry).toEqual({
    settlementId: first.settlementId,
    email: "sent",
    notifications: "processed",
  });
});

it("supports erased or anonymous donors without acknowledgement", async () => {
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  await db.delete(donors).where(eq(donors.id, submission!.donorId!));
  const result = await simulateDonation(services(), input());
  expect(result.email).toBe("no-email");
  expect(
    await db
      .select()
      .from(acknowledgements)
      .where(eq(acknowledgements.settlementId, result.settlementId)),
  ).toHaveLength(0);
});

it("rejects disabled simulation, non-admin roles, cross-tenant submissions and invalid amounts", async () => {
  const before = await db.select().from(settlements);
  for (const override of [
    { enabled: false },
    { role: "member" },
    { organisationId: "00000000-0000-0000-0000-000000000000" },
    { amountSats: 0 },
    { amountSats: 1.5 },
    { amountSats: Number.MAX_SAFE_INTEGER },
  ]) {
    await expect(
      simulateDonation(services(), { ...input(), ...override }),
    ).rejects.toThrow();
  }
  expect(await db.select().from(settlements)).toHaveLength(before.length);
});

it("does not change a previous simulation when retried with another amount", async () => {
  const result = await simulateDonation(services(), input());
  await expect(
    simulateDonation(services(), { ...input(), amountSats: 200000 }),
  ).rejects.toThrow("conflicts");
  expect(
    (
      await db
        .select()
        .from(settlements)
        .where(eq(settlements.id, result.settlementId))
    )[0]!.amountSats,
  ).toBe(100000);
});

it("rolls settlement creation back when the rate is unavailable", async () => {
  const before = await db.select().from(settlements);
  await db
    .update(organisationSettings)
    .set({ reportingCurrency: "XYZ" })
    .where(eq(organisationSettings.organisationId, orgId));
  await expect(simulateDonation(services(), input())).rejects.toThrow(
    "no fixed rate",
  );
  expect(await db.select().from(settlements)).toHaveLength(before.length);
  expect((await widgetSession(db, orgId, origin, token))!.funded).toBe(false);
  expect(
    await db
      .select()
      .from(emailLog)
      .where(eq(emailLog.templateVersion, "donation-acknowledgement@1")),
  ).toHaveLength(0);
});

it("queues notifications only after opt-in and delivers to owners", async () => {
  const { saveDonationNotifications } =
    await import("./donation-notifications");
  const { user, member, donationNotifications } = await import("./db/schema");
  const [owner] = await db
    .insert(user)
    .values({ name: "Owner", email: "owner@example.org" })
    .returning();
  await db
    .insert(member)
    .values({ userId: owner!.id, organizationId: orgId, role: "owner" });
  await saveDonationNotifications(db, crypto, orgId, "owner", {
    notificationMode: "per-donation",
    notificationEmail: "",
  });
  const result = await simulateDonation(services(), input());
  expect(result.notifications).toBe("processed");
  const notice = mailer.sent.find(
    (m) => m.templateVersion === "charity-donation@1",
  )!;
  expect(notice.to).toBe("owner@example.org");
  expect(notice.text).toContain("DEMONSTRATION");
  expect(notice.text).not.toContain("donor@example.org");
  expect((await db.select().from(donationNotifications))[0]!.status).toBe(
    "sent",
  );
  await simulateDonation(services(), input());
  expect(
    mailer.sent.filter((m) => m.templateVersion === "charity-donation@1"),
  ).toHaveLength(1);
});

it("holds daily notifications until the following UTC day and encrypts a chosen recipient", async () => {
  const { saveDonationNotifications, deliverDonationNotifications } =
    await import("./donation-notifications");
  await saveDonationNotifications(db, crypto, orgId, "admin", {
    notificationMode: "daily",
    notificationEmail: "finance@example.org",
  });
  const [settings] = await db
    .select()
    .from(organisationSettings)
    .where(eq(organisationSettings.organisationId, orgId));
  expect(settings!.notificationEmailEnc).not.toContain("finance");
  await simulateDonation(services(), input());
  expect(
    mailer.sent.filter((m) => m.templateVersion === "charity-digest@1"),
  ).toHaveLength(0);
  const tomorrow = new Date(Date.now() + 86400000);
  await deliverDonationNotifications(services(), orgId, { now: tomorrow });
  const messages = mailer.sent.filter(
    (m) => m.templateVersion === "charity-digest@1",
  );
  expect(messages).toHaveLength(1);
  expect(messages[0]!.to).toBe("finance@example.org");
  await deliverDonationNotifications(services(), orgId, { now: tomorrow });
  expect(
    mailer.sent.filter((m) => m.templateVersion === "charity-digest@1"),
  ).toHaveLength(1);
});

it("retains failed notifications and cancels queued notices on preference changes", async () => {
  const { saveDonationNotifications, deliverDonationNotifications } =
    await import("./donation-notifications");
  const { donationNotifications } = await import("./db/schema");
  await saveDonationNotifications(db, crypto, orgId, "owner", {
    notificationMode: "per-donation",
    notificationEmail: "finance@example.org",
  });
  const failing = {
    ...services(),
    mailer: {
      name: "failed",
      send: async () => {
        throw new Error("Unavailable");
      },
    },
  };
  const result = await simulateDonation(failing, input());
  expect(result.notifications).toBe("failed");
  expect((await db.select().from(donationNotifications))[0]!.status).toBe(
    "pending",
  );
  await saveDonationNotifications(db, crypto, orgId, "owner", {
    notificationMode: "off",
  });
  expect((await db.select().from(donationNotifications))[0]!.status).toBe(
    "cancelled",
  );
  expect(
    await deliverDonationNotifications(services(), orgId, { flushDaily: true }),
  ).toBe(0);
  await expect(
    saveDonationNotifications(db, crypto, orgId, "member", {
      notificationMode: "daily",
    }),
  ).rejects.toThrow();
  await expect(
    saveDonationNotifications(db, crypto, orgId, "owner", {
      notificationMode: "daily",
      notificationEmail: "a@b.com\r\nBcc: other@example.org",
    }),
  ).rejects.toThrow();
});
