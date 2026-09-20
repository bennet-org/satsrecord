import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "./db/test-db";
import { createCrypto } from "./crypto";
import { SingleSigDeriver, normaliseInput } from "./bitcoin";
import { ConsoleMailer } from "./mail";
import {
  addresses,
  consents,
  descriptors,
  donors,
  organisationSettings,
  organization,
  settlements,
  submissions,
} from "./db/schema";
import {
  consumeWidgetLimit,
  issueWidgetAddress,
  verifyDonorEmail,
  widgetConfig,
  widgetSession,
  type WidgetServices,
} from "./widget";
import { handleWidgetRequest } from "./widget-http";
const zpub =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
const origin = "http://localhost:8080";
const crypto = createCrypto({
  encryptionKey: randomBytes(32).toString("base64"),
  indexKey: randomBytes(32).toString("base64"),
});
const token = () => randomBytes(32).toString("hex");
let db: Awaited<ReturnType<typeof createTestDb>>,
  services: WidgetServices,
  orgId: string,
  mailer: ConsoleMailer;
const input = (extra: Record<string, unknown> = {}) => ({
  token: token(),
  name: "",
  email: "",
  marketing: false,
  ...extra,
});
beforeEach(async () => {
  db = await createTestDb();
  const [org] = await db
    .insert(organization)
    .values({ name: "Test Charity", slug: "widget-test" })
    .returning();
  orgId = org!.id;
  await db.insert(organisationSettings).values({
    organisationId: orgId,
    completedAt: new Date(),
    allowedOrigins: [origin],
    senderName: "Test Charity",
    replyTo: "hello@example.org",
  });
  await db.insert(descriptors).values({
    organisationId: orgId,
    descriptorEnc: crypto.encrypt(normaliseInput(zpub).descriptor!.canonical),
    scriptType: "wpkh",
    network: "mainnet",
    label: "test",
  });
  mailer = new ConsoleMailer(() => {});
  services = {
    db,
    crypto,
    mailer,
    deriver: new SingleSigDeriver(),
    from: { address: "hello@satsrecord.org" },
    appUrl: "http://localhost:4321",
  };
});
afterEach(async () => {
  await db.$client.close();
});
const issue = (body = input(), ip = "127.0.0.1") =>
  issueWidgetAddress(services, orgId, origin, ip, body);
function request(
  method: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return handleWidgetRequest(
    new Request(`http://localhost:4321/api/widget/${orgId}`, {
      method,
      headers: {
        Origin: origin,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    orgId,
    "127.0.0.1",
    services,
  );
}
describe("widget issuance", () => {
  it("derives only on submission and gives retries the same address without PII or duplicate mail", async () => {
    await widgetConfig(db, orgId, origin);
    expect(await db.select().from(addresses)).toHaveLength(0);
    const body = input({
      name: "A <Donor>",
      email: "DONOR@example.org",
      marketing: true,
      consentLabel: "Send me charity news.",
    });
    const first = await issue(body);
    expect(first).toEqual({
      address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
      funded: false,
      emailStatus: "sent",
    });
    expect(await issue(body)).toEqual(first);
    expect(await db.select().from(addresses)).toHaveLength(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: "donor@example.org",
      from: { name: "Test Charity via SatsRecord" },
      replyTo: "hello@example.org",
      templateVersion: "address-issued@1",
    });
    expect(mailer.sent[0]!.text).toContain(first.address);
    const [donor] = await db.select().from(donors);
    expect(donor!.nameEnc).not.toContain("Donor");
    expect(crypto.decrypt(donor!.emailEnc!)).toBe("donor@example.org");
    expect(donor!.attribution).toBe("claimed");
    expect((await db.select().from(consents))[0]).toMatchObject({
      granted: true,
      labelVersion: "Send me charity news.",
    });
    const verification = mailer.sent[0]!.text.match(
      /verify#([a-f0-9]{64})/,
    )![1]!;
    expect(donor!.verificationTokenHash).not.toBe(verification);
    expect(await verifyDonorEmail(db, verification)).toBe(true);
    expect(await verifyDonorEmail(db, verification)).toBe(false);
    expect((await db.select().from(donors))[0]!.attribution).toBe(
      "email_confirmed",
    );
  });
  it("serializes simultaneous retries and never reuses an index for separate sessions", async () => {
    const body = input();
    const same = await Promise.all([issue(body), issue(body), issue(body)]);
    expect(new Set(same.map((s) => s.address)).size).toBe(1);
    const separate = await Promise.all([issue(), issue(), issue()]);
    expect(
      new Set([same[0]!.address, ...separate.map((s) => s.address)]).size,
    ).toBe(4);
    expect(
      (await db.select().from(addresses)).map((a) => a.index).sort(),
    ).toEqual([0, 1, 2, 3]);
    expect(await db.select().from(donors)).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });
  it("creates separate donor rows for identical details and rejects missing email for consent", async () => {
    const details = { name: "Same", email: "same@example.org" };
    const first = await issue(input(details));
    const second = await issue(input(details));
    expect(first.address).not.toBe(second.address);
    expect(await db.select().from(donors)).toHaveLength(2);
    await expect(issue(input({ marketing: true }))).rejects.toThrow("email");
    await expect(issue(input({ email: "invalid" }))).rejects.toThrow("email");
    await expect(issue(input({ token: "short" }))).rejects.toThrow("session");
  });
  it("keeps addresses available on email failure and on donor erasure", async () => {
    services.mailer = {
      name: "broken",
      send: async () => {
        throw new Error("provider unavailable");
      },
    };
    const body = input({ email: "donor@example.org" });
    const result = await issue(body);
    expect(result.emailStatus).toBe("failed");
    await db.delete(donors);
    expect(await issue(body)).toEqual(result);
    expect(await db.select().from(addresses)).toHaveLength(1);
    expect((await db.select().from(submissions))[0]!.donorId).toBeNull();
  });
  it("returns funded status without amounts and requires a new session for another donation", async () => {
    const body = input();
    await issue(body);
    const [address] = await db.select().from(addresses);
    await db.insert(settlements).values({
      organisationId: orgId,
      addressId: address!.id,
      kind: "onchain",
      txid: "a".repeat(64),
      vout: 0,
      amountSats: 1234,
      firstSeenAt: new Date(),
      status: "mempool",
    });
    const funded = await widgetSession(db, orgId, origin, body.token);
    expect(funded).toEqual({
      address: address!.address,
      funded: true,
      emailStatus: "none",
    });
    expect(await issue(body)).toEqual(funded);
    expect((await issue()).address).not.toBe(address!.address);
  });
  it("rolls back counter and records if derivation fails", async () => {
    services.deriver = {
      derive: async () => {
        throw new Error("failure");
      },
    };
    await expect(issue()).rejects.toThrow("failure");
    expect((await db.select().from(descriptors))[0]!.nextIndex).toBe(0);
    expect(await db.select().from(submissions)).toHaveLength(0);
  });
  it("does not verify expired or erased donor records", async () => {
    await issue(input({ email: "donor@example.org" }));
    const verification = mailer.sent[0]!.text.match(
      /verify#([a-f0-9]{64})/,
    )![1]!;
    expect(
      await verifyDonorEmail(
        db,
        verification,
        new Date(Date.now() + 8 * 86_400_000),
      ),
    ).toBe(false);
    await db.delete(donors);
    expect(await verifyDonorEmail(db, verification)).toBe(false);
  });
});
describe("widget API boundary", () => {
  it("supports explicitly allowed same-origin GETs without trusting cross-site fetch metadata", async () => {
    const make = (site: string) =>
      handleWidgetRequest(
        new Request(`http://localhost:4321/api/widget/${orgId}`, {
          headers: { "Sec-Fetch-Site": site },
        }),
        orgId,
        "127.0.0.1",
        services,
      );
    expect((await make("same-origin")).status).toBe(403);
    await db
      .update(organisationSettings)
      .set({ allowedOrigins: ["http://localhost:4321"] })
      .where(eq(organisationSettings.organisationId, orgId));
    expect((await make("same-origin")).status).toBe(200);
    expect((await make("cross-site")).status).toBe(403);
  });
  it("enforces the organisation-origin issuance limit across different IPs", async () => {
    const key = crypto.emailIndex(`widget:issue:origin:${orgId}:${origin}`);
    for (let i = 0; i < 100; i++)
      await consumeWidgetLimit(db, key, 100, 3_600_000);
    await expect(issue(input(), "192.0.2.1")).rejects.toThrow("Too many");
    await expect(issue(input(), "192.0.2.2")).rejects.toThrow("Too many");
    expect(await db.select().from(addresses)).toHaveLength(0);
  });

  it("allows exact origins and preflight, rejects missing or spoofed origins", async () => {
    expect((await request("OPTIONS")).status).toBe(204);
    const response = await request("GET");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      organisation: "Test Charity",
    });
    for (const value of [
      "",
      "null",
      "http://localhost:8081",
      "http://localhost:8080.evil.com",
    ]) {
      const blocked = await request("POST", input(), { Origin: value });
      expect(blocked.status).toBe(403);
      expect(blocked.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
    expect(await db.select().from(addresses)).toHaveLength(0);
  });
  it("scopes sessions to organisation and origin and never responds with PII", async () => {
    const body = input({ name: "Private Name", email: "private@example.org" });
    await request("POST", body);
    const response = await request("GET", undefined, {
      Authorization: `Bearer ${body.token}`,
    });
    expect(
      Object.keys((await response.json()) as Record<string, unknown>).sort(),
    ).toEqual(["address", "emailStatus", "funded"]);
    expect(
      (await request("GET", undefined, { Authorization: `Bearer ${token()}` }))
        .status,
    ).toBe(404);
    expect(
      await widgetSession(
        db,
        randomBytes(16).toString("hex"),
        origin,
        body.token,
      ),
    ).toBeNull();
    expect(
      await widgetSession(db, orgId, "https://other.example", body.token),
    ).toBeNull();
    await db
      .update(organisationSettings)
      .set({ allowedOrigins: [] })
      .where(eq(organisationSettings.organisationId, orgId));
    expect(
      (
        await request("GET", undefined, {
          Authorization: `Bearer ${body.token}`,
        })
      ).status,
    ).toBe(403);
  });
  it("rejects oversized and malformed bodies and unsupported methods", async () => {
    expect((await request("POST", { name: "x".repeat(5000) })).status).toBe(
      413,
    );
    expect((await request("POST", [1, 2])).status).toBe(400);
    expect(
      (await request("POST", input(), { "Content-Type": "text/plain" })).status,
    ).toBe(415);
    expect((await request("DELETE")).status).toBe(405);
  });
  it("enforces per-IP issuance limits without breaking retries", async () => {
    const body = input();
    await issue(body);
    for (let i = 0; i < 9; i++) await issue();
    const limited = await request("POST", input());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("3600");
    expect((await request("POST", body)).status).toBe(200);
    expect(await db.select().from(addresses)).toHaveLength(10);
  });
  it("counts concurrent requests atomically and resets the rate window", async () => {
    const now = new Date("2026-09-19T10:00:00Z");
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        consumeWidgetLimit(db, "test", 3, 60_000, now),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(3);
    await expect(
      consumeWidgetLimit(
        db,
        "test",
        3,
        60_000,
        new Date(now.getTime() + 60_000),
      ),
    ).resolves.toBeUndefined();
  });
});
