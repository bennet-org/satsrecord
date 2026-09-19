import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createTestDb } from "./db/test-db";
import type { Db } from "./db/client";
import { organization } from "./db/schema";
import { createCrypto } from "./crypto";
import { FakeChainSource } from "./fakes";
import {
  chooseWalletScript,
  confirmWallet,
  finishSetup,
  getSetup,
  inspectWallet,
  nextSetupStep,
  normaliseOrigins,
  saveOrganisationDetails,
  saveOrigins,
  saveSender,
  saveWalletDraft,
} from "./onboarding";
import { deriveAddress, normaliseInput } from "./bitcoin";
const zpub =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
const xpub =
  "xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V";
const address = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
const crypto = createCrypto({
  encryptionKey: randomBytes(32).toString("base64"),
  indexKey: randomBytes(32).toString("base64"),
});
let db: Db, orgId: string, chain: FakeChainSource;
beforeEach(async () => {
  db = await createTestDb();
  const [org] = await db
    .insert(organization)
    .values({ name: "Test", slug: "test" })
    .returning();
  orgId = org!.id;
  chain = new FakeChainSource();
});
async function details() {
  await saveOrganisationDetails(db, orgId, {
    name: "Test Charity",
    registrationNumber: "12345",
    country: "GB",
    reportingCurrency: "GBP",
  });
}
async function revision() {
  return (await getSetup(db, orgId))!.walletRevision!;
}
async function ready() {
  await details();
  await saveWalletDraft(db, crypto, orgId, zpub);
  await confirmWallet(db, crypto, chain, orgId, await revision(), true, false);
  await saveSender(db, orgId, "Test Charity", "hello@example.org");
  await saveOrigins(db, orgId, "https://example.org\nhttp://localhost:8080");
}
describe("onboarding", () => {
  it("resumes an encrypted draft, derives the known address and activates exactly once", async () => {
    await details();
    expect(nextSetupStep(await getSetup(db, orgId))).toBe(2);
    await saveWalletDraft(db, crypto, orgId, zpub);
    const s = (await getSetup(db, orgId))!;
    expect(s.walletDraftEnc).not.toContain(xpub);
    expect(crypto.decrypt(s.walletDraftEnc!)).toBe(`wpkh(${xpub}/0/*)`);
    expect(await inspectWallet(crypto, s, chain)).toMatchObject({
      address,
      used: false,
    });
    expect(await db.query.descriptors.findMany()).toHaveLength(0);
    await confirmWallet(
      db,
      crypto,
      chain,
      orgId,
      s.walletRevision!,
      true,
      false,
    );
    await saveSender(db, orgId, "Test Charity", "HELLO@example.org");
    await saveOrigins(db, orgId, "https://EXAMPLE.org/\nhttps://example.org");
    await finishSetup(db, crypto, orgId);
    await finishSetup(db, crypto, orgId);
    const ds = await db.query.descriptors.findMany();
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({
      status: "active",
      nextIndex: 0,
      network: "mainnet",
      freshCheckOverridden: false,
    });
    expect(crypto.decrypt(ds[0]!.descriptorEnc)).toBe(`wpkh(${xpub}/0/*)`);
    expect(await getSetup(db, orgId)).toMatchObject({
      walletDraftEnc: null,
      replyTo: "hello@example.org",
      allowedOrigins: ["https://example.org"],
    });
    await expect(saveWalletDraft(db, crypto, orgId, zpub)).rejects.toThrow(
      "already complete",
    );
  });
  it("requires script selection for bare xpub and binds confirmation to the latest draft", async () => {
    await details();
    await saveWalletDraft(db, crypto, orgId, xpub);
    const old = await revision();
    expect(
      await inspectWallet(crypto, (await getSetup(db, orgId))!, chain),
    ).toEqual({ needsScriptType: true });
    await expect(
      confirmWallet(db, crypto, chain, orgId, old, true, false),
    ).rejects.toThrow("address type");
    await chooseWalletScript(db, crypto, orgId, old, "wpkh");
    await expect(
      confirmWallet(db, crypto, chain, orgId, old, true, false),
    ).rejects.toThrow("Confirm");
    await confirmWallet(
      db,
      crypto,
      chain,
      orgId,
      await revision(),
      true,
      false,
    );
    await saveWalletDraft(db, crypto, orgId, zpub);
    expect((await getSetup(db, orgId))!.walletConfirmed).toBe(false);
  });
  it("detects history at index 19, rechecks confirmation and records explicit override", async () => {
    await details();
    await saveWalletDraft(db, crypto, orgId, zpub);
    chain.fund(deriveAddress(normaliseInput(zpub).descriptor!, 19), 1000);
    expect(
      await inspectWallet(crypto, (await getSetup(db, orgId))!, chain),
    ).toMatchObject({ used: true });
    await expect(
      confirmWallet(db, crypto, chain, orgId, await revision(), true, false),
    ).rejects.toThrow("history");
    await confirmWallet(db, crypto, chain, orgId, await revision(), true, true);
    await saveSender(db, orgId, "Test", "hello@example.org");
    await saveOrigins(db, orgId, "https://example.org");
    await finishSetup(db, crypto, orgId);
    expect((await db.query.descriptors.findFirst())!.freshCheckOverridden).toBe(
      true,
    );
  });
  it("fails closed on a chain error and rejects skipping confirmation or setup", async () => {
    await expect(finishSetup(db, crypto, orgId)).rejects.toThrow("Complete");
    await expect(saveWalletDraft(db, crypto, orgId, zpub)).rejects.toThrow(
      "details",
    );
    await details();
    await saveWalletDraft(db, crypto, orgId, zpub);
    await expect(
      confirmWallet(db, crypto, chain, orgId, await revision(), false, false),
    ).rejects.toThrow("Confirm");
    await expect(
      confirmWallet(
        db,
        crypto,
        {
          history: async () => {
            throw new Error("offline");
          },
        },
        orgId,
        await revision(),
        true,
        false,
      ),
    ).rejects.toThrow("offline");
    expect((await getSetup(db, orgId))!.walletConfirmed).toBe(false);
    await expect(
      saveSender(db, orgId, "Test", "hello@example.org"),
    ).rejects.toThrow("wallet");
  });
  it("keeps separate organisation drafts isolated", async () => {
    await ready();
    const [other] = await db
      .insert(organization)
      .values({ name: "Other", slug: "other" })
      .returning();
    await expect(
      confirmWallet(
        db,
        crypto,
        chain,
        other!.id,
        await revision(),
        true,
        false,
      ),
    ).rejects.toThrow("Confirm");
    expect((await getSetup(db, orgId))!.walletConfirmed).toBe(true);
  });
  it("rejects testnet, private keys and unsupported multisig without storing them", async () => {
    await details();
    for (const input of [
      "upub5EFU65HtV5TeiSHmZZm7FUffBGy8UKeqp7vw43jYbvZPpoVsgU93oac7Wk3u6moKegAEWtGNF8DehrnHtv21XXEMYRUocHqguyjknFHYfgY",
      "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
      `wsh(sortedmulti(1,${xpub}/0/*))`,
    ]) {
      await expect(saveWalletDraft(db, crypto, orgId, input)).rejects.toThrow();
    }
    expect((await getSetup(db, orgId))!.walletDraftEnc).toBeNull();
  });
});
it("normalises origins without accepting paths, wildcards, credentials or remote HTTP", () => {
  expect(
    normaliseOrigins("https://Example.org/\nhttp://localhost:8080"),
  ).toEqual(["https://example.org", "http://localhost:8080"]);
  for (const bad of [
    "",
    "https://example.org/donate",
    "https://*.example.org",
    "http://example.org",
    "https://u:p@example.org",
    "https://example.org?x=1",
    "https://example.org#x",
    "null",
  ])
    expect(() => normaliseOrigins(bad)).toThrow();
});
