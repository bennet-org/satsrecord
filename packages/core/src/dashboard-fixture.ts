/** Development/test fixture. Always creates a separate organisation; never issues from a real wallet. */
import { HDKey } from "@scure/bip32";
import { randomUUID } from "node:crypto";
import type { Db } from "./db/client";
import type { Crypto } from "./crypto";
import { normaliseInput, deriveAddress } from "./bitcoin";
import {
  organization,
  organisationSettings,
  descriptors,
  addresses,
  donors,
  submissions,
  settlements,
  valuations,
  acknowledgements,
  consents,
  amendments,
  emailLog,
  member,
} from "./db/schema";
import { widgetDefaults } from "./dashboard";
export async function seedDashboard(db: Db, crypto: Crypto, userId?: string) {
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organization)
      .values({ name: "Demo · Harbour Aid", slug: `demo-${randomUUID()}` })
      .returning();
    const orgId = org!.id;
    if (userId)
      await tx
        .insert(member)
        .values({ userId, organizationId: orgId, role: "owner" });
    await tx.insert(organisationSettings).values({
      organisationId: orgId,
      registrationNumber: "DEMO-123",
      country: "GB",
      reportingCurrency: "GBP",
      senderName: "Harbour Aid",
      replyTo: "hello@example.org",
      allowedOrigins: ["https://example.org"],
      walletConfirmed: true,
      completedAt: new Date(),
      widgetConfig: widgetDefaults,
    });
    // Public BIP84 vector; never send funds to these addresses. Unique extended key per fixture via public derivation.
    const root = HDKey.fromExtendedKey(
      "xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V",
    );
    const child = root.deriveChild(parseInt(randomUUID().slice(0, 7), 16));
    const p = normaliseInput(child.publicExtendedKey, "wpkh").descriptor!;
    const [wallet] = await tx
      .insert(descriptors)
      .values({
        organisationId: orgId,
        descriptorEnc: crypto.encrypt(p.canonical),
        scriptType: "wpkh",
        network: "mainnet",
        label: "DEMO",
        nextIndex: 85,
      })
      .returning();
    const donorIds: string[] = [],
      settlementIds: string[] = [];
    for (let index = 0; index < 85; index++) {
      const i = [0, 14, 39, 72].indexOf(index);
      const time = new Date(Date.UTC(2026, 8, 10 + Math.floor(index / 10), 12));
      const [address] = await tx
        .insert(addresses)
        .values({
          descriptorId: wallet!.id,
          index,
          address: deriveAddress(p, index),
          issuedAt: time,
        })
        .returning();
      let donorId: string | null = null;
      if (i >= 0 && i < 3) {
        const email = [
          "alex@example.org",
          "sam@example.org",
          "alex@example.org",
        ][i]!;
        const [d] = await tx
          .insert(donors)
          .values({
            organisationId: orgId,
            nameEnc: crypto.encrypt(i === 1 ? "Sam Reed" : "Alex Morgan"),
            emailEnc: crypto.encrypt(email),
            emailIndex: crypto.emailIndex(email),
            attribution: i === 1 ? "claimed" : "email_confirmed",
            verifiedAt: i === 1 ? null : time,
            createdAt: time,
          })
          .returning();
        donorId = d!.id;
        donorIds.push(donorId);
        await tx.insert(consents).values({
          donorId,
          kind: "marketing",
          granted: i === 0,
          labelVersion: "demo-v1",
          createdAt: time,
        });
      }
      await tx.insert(submissions).values({
        organisationId: orgId,
        addressId: address!.id,
        donorId,
        sessionTokenHash: randomUUID(),
        origin: "https://example.org",
        createdAt: time,
      });
      if (i === -1) continue; // Unfunded address remains in manifest.
      for (let payment = 0; payment < (i === 0 ? 2 : 1); payment++) {
        const status = i === 1 ? "mempool" : i === 3 ? "reorged" : "confirmed";
        const [s] = await tx
          .insert(settlements)
          .values({
            organisationId: orgId,
            addressId: address!.id,
            kind: "onchain",
            txid:
              randomUUID().replaceAll("-", "") +
              randomUUID().replaceAll("-", ""),
            vout: 0,
            amountSats: 100000 * (i + 1),
            firstSeenAt: time,
            blockTime: status === "mempool" ? null : time,
            blockHeight: status === "mempool" ? null : 900000 + i,
            status,
            createdAt: time,
          })
          .returning();
        settlementIds.push(s!.id);
        if (status !== "mempool") {
          const [v] = await tx
            .insert(valuations)
            .values({
              settlementId: s!.id,
              currency: "GBP",
              rate: "50000",
              amount: String(50 * (i + 1)),
              source: "demo-fixed",
              pair: "BTC/GBP",
              method: "fixture",
              rateTimestamp: time,
              confirmationsAtValuation: 1,
              createdAt: time,
            })
            .returning();
          if (donorId) {
            await tx.insert(acknowledgements).values({
              settlementId: s!.id,
              valuationId: v!.id,
              donorId,
              attributionAtSend: "email_confirmed",
              templateVersion: "demo-v1",
              providerMessageId: "demo-not-sent",
              sentAt: time,
            });
            await tx.insert(emailLog).values({
              organisationId: orgId,
              donorId,
              templateVersion: "demo-v1",
              provider: "fixture",
              sentAt: time,
            });
          }
          if (status === "reorged")
            await tx.insert(amendments).values({
              organisationId: orgId,
              table: "settlements",
              supersedesId: s!.id,
              reason: "Demonstration reorganisation record",
              amendedBy: "demo-fixture",
              createdAt: time,
            });
        }
      }
    }
    return { orgId, donorIds, settlementIds };
  });
}
