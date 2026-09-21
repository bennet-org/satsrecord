import { beforeEach, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createTestDb } from "./db/test-db";
import type { Db } from "./db/client";
import { createCrypto } from "./crypto";
import { seedDashboard } from "./dashboard-fixture";
import {
  csv,
  donationTotals,
  donorById,
  donorsByIds,
  walletGapLimits,
  donationDetail,
  eraseDonor,
  listDonations,
  listDonors,
  walletManifest,
  saveWidgetConfig,
  widgetDefaults,
  resolveWidgetConfig,
  widgetSnippet,
  updateDashboardSettings,
} from "./dashboard";
import { getSetup } from "./onboarding";
let db: Db, fixture: Awaited<ReturnType<typeof seedDashboard>>;
const crypto = createCrypto({
  encryptionKey: randomBytes(32).toString("base64"),
  indexKey: randomBytes(32).toString("base64"),
});
beforeEach(async () => {
  db = await createTestDb();
  fixture = await seedDashboard(db, crypto);
});
it("scopes reads and erasure to the organisation, and requires admin confirmation", async () => {
  const other = await seedDashboard(db, crypto);
  expect(
    await donationDetail(db, other.orgId, fixture.settlementIds[0]!),
  ).toBeNull();
  expect(await donationDetail(db, other.orgId, "invalid")).toBeNull();
  await expect(
    eraseDonor(db, other.orgId, "owner", fixture.donorIds[0]!, true),
  ).rejects.toThrow("not found");
  await expect(
    eraseDonor(db, fixture.orgId, "member", fixture.donorIds[0]!, true),
  ).rejects.toThrow("admin");
  await expect(
    eraseDonor(db, fixture.orgId, "owner", fixture.donorIds[0]!, false),
  ).rejects.toThrow("Confirm");
  expect(await listDonors(db, crypto, fixture.orgId)).toHaveLength(3);
});
it("erases PII and consent while preserving both payments, valuations, acknowledgements and logs", async () => {
  await eraseDonor(db, fixture.orgId, "admin", fixture.donorIds[0]!, true);
  const donors = await listDonors(db, crypto, fixture.orgId);
  expect(donors).toHaveLength(2); // Same-email submission is independent.
  const rows = await listDonations(db, fixture.orgId);
  expect(rows).toHaveLength(5);
  for (const id of fixture.settlementIds.slice(0, 2)) {
    const d = await donationDetail(db, fixture.orgId, id);
    expect(d?.donorId).toBeNull();
    expect(d?.values).toHaveLength(1);
    expect(d?.receipts[0]?.donorId).toBeNull();
  }
  expect(
    (await db.query.consents.findMany()).some(
      (c) => c.donorId === fixture.donorIds[0],
    ),
  ).toBe(false);
  expect(
    (await db.query.emailLog.findMany()).filter((l) => l.donorId === null),
  ).toHaveLength(2);
  expect(await walletManifest(db, fixture.orgId)).toMatchObject([
    { gapLimit: 104, addresses: expect.any(Array) },
  ]);
  expect((await walletManifest(db, fixture.orgId))[0]!.addresses).toHaveLength(
    85,
  );
});
it("validates settings and preserves existing valuations and wallet", async () => {
  await updateDashboardSettings(db, fixture.orgId, "admin", {
    intent: "organisation",
    name: "Updated",
    registrationNumber: "123",
    country: "US",
    reportingCurrency: "USD",
  });
  expect((await getSetup(db, fixture.orgId))?.reportingCurrency).toBe("USD");
  expect(
    (await donationDetail(db, fixture.orgId, fixture.settlementIds[0]!))
      ?.values[0]?.currency,
  ).toBe("GBP");
  await expect(
    updateDashboardSettings(db, fixture.orgId, "owner", {
      intent: "origins",
      origins: "https://example.org/path",
    }),
  ).rejects.toThrow();
  await expect(
    saveWidgetConfig(db, fixture.orgId, "member", widgetDefaults),
  ).rejects.toThrow("admin");
  await expect(
    saveWidgetConfig(db, fixture.orgId, "owner", {
      ...widgetDefaults,
      accent: "red;position:fixed",
    }),
  ).rejects.toThrow("colour");
  await saveWidgetConfig(db, fixture.orgId, "owner", {
    ...widgetDefaults,
    heading: '<img src=x onerror="alert(1)">',
  });
  const s = await getSetup(db, fixture.orgId);
  expect(
    widgetSnippet("https://example.org", fixture.orgId, s!.widgetConfig!),
  ).toContain("&lt;img");
});
it("scoped reads agree with reading the whole organisation", async () => {
  const orgId = fixture.orgId;
  const all = await listDonations(db, orgId);
  const everyDonor = await listDonors(db, crypto, orgId);

  const totals = await donationTotals(db, orgId);
  expect(totals.count).toBe(all.length);
  expect(totals.confirmedSats).toBe(
    all
      .filter((r) => r.settlement.status === "confirmed")
      .reduce((sum, r) => sum + r.settlement.amountSats, 0),
  );

  expect(await walletGapLimits(db, orgId)).toEqual(
    (await walletManifest(db, orgId)).map((w) => ({
      id: w.id,
      label: w.label,
      gapLimit: w.gapLimit,
    })),
  );

  const recent = await listDonations(db, orgId, { limit: 10 });
  expect(recent).toEqual(all.slice(0, 10));

  const donorId = fixture.donorIds[0]!;
  expect(await donorById(db, crypto, orgId, donorId)).toEqual(
    everyDonor.find((d) => d.id === donorId),
  );
  expect(await listDonations(db, orgId, { donorId })).toEqual(
    all.filter((r) => r.donorId === donorId),
  );

  // Exactly the donors the rows reference, and no fallback to reading them all.
  const shown = await donorsByIds(
    db,
    crypto,
    orgId,
    recent.map((r) => r.donorId),
  );
  expect(shown.map((d) => d.id).sort()).toEqual(
    [...new Set(recent.map((r) => r.donorId).filter(Boolean))].sort(),
  );
  expect(await donorsByIds(db, crypto, orgId, [])).toEqual([]);
  expect(await donorsByIds(db, crypto, orgId, [null, null])).toEqual([]);
  expect(everyDonor.length).toBeGreaterThan(0);
});

it("keeps scoped reads inside the organisation", async () => {
  const other = await seedDashboard(db, crypto);
  expect(
    await donorById(db, crypto, fixture.orgId, other.donorIds[0]!),
  ).toBeNull();
  expect(await donorsByIds(db, crypto, fixture.orgId, other.donorIds)).toEqual(
    [],
  );
  expect(await donorById(db, crypto, fixture.orgId, "not-a-uuid")).toBeNull();
  expect(await donorById(db, crypto, fixture.orgId, null)).toBeNull();
});

it("quotes multiline CSV and neutralises spreadsheet formulas", () => {
  expect(csv([["a,b", 'a"b', "line\nbreak", " =SUM(A1)", "@test", null]])).toBe(
    '"a,b","a""b","line\nbreak","\' =SUM(A1)","\'@test",""\r\n',
  );
});

it("saves custom colours and intro text safely, and upgrades old preset configuration", async () => {
  await saveWidgetConfig(db, fixture.orgId, "owner", {
    ...widgetDefaults,
    preset: "custom",
    showBranding: false,
    accent: "#244f46",
    buttonText: "#ffffff",
    description: "<strong>Help our work.</strong>",
  });
  const setup = await getSetup(db, fixture.orgId);
  const snippet = widgetSnippet(
    "https://example.org",
    fixture.orgId,
    setup!.widgetConfig!,
  );
  expect(snippet).toContain('preset="custom"');
  expect(snippet).toContain('show-branding="false"');
  expect(snippet).toContain("--sr-button-text:#ffffff");
  expect(snippet).toContain("&lt;strong&gt;Help our work.&lt;/strong&gt;");
  expect(resolveWidgetConfig({ preset: "editorial" })).toMatchObject({
    preset: "satsrecord",
    description: widgetDefaults.description,
    showBranding: true,
  });
  await expect(
    saveWidgetConfig(db, fixture.orgId, "owner", {
      ...widgetDefaults,
      buttonText: "red;position:fixed",
    }),
  ).rejects.toThrow("colour");
});
