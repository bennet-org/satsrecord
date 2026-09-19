import { randomUUID } from "node:crypto";
import { HDKey } from "@scure/bip32";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import type { Crypto } from "./crypto";
import type { ChainSource } from "./domain";
import { descriptors, organisationSettings, organization } from "./db/schema";
import {
  normaliseInput,
  parseDescriptor,
  deriveAddress,
  type ScriptType,
} from "./bitcoin";

export class OnboardingError extends Error {}
export const reportingCurrencies = [
  "GBP",
  "USD",
  "EUR",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "JPY",
] as const;
// ISO 3166-1 alpha-2. Intl supplies localised display names in the UI.
export const countryCodes =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
export type Setup = typeof organisationSettings.$inferSelect;
export function nextSetupStep(s: Setup | undefined) {
  if (!s?.country || !s.reportingCurrency) return 1;
  if (!s.walletConfirmed) return 2;
  if (!s.senderName || !s.replyTo) return 3;
  if (!s.allowedOrigins?.length) return 4;
  return 5;
}
export async function getSetup(db: Db, orgId: string) {
  return db.query.organisationSettings.findFirst({
    where: eq(organisationSettings.organisationId, orgId),
  });
}
function clean(value: string, label: string, max: number, min = 1) {
  const v = value.trim();
  if (v.length < min || v.length > max || /[\u0000-\u001f\u007f]/.test(v))
    throw new OnboardingError(`Enter a valid ${label}.`);
  return v;
}
export function normaliseOrigins(input: string) {
  if (input.length > 5000)
    throw new OnboardingError("The origin list is too long.");
  const parts = input
    .split(/[\r\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > 20)
    throw new OnboardingError("Enter between 1 and 20 website origins.");
  return [
    ...new Set(
      parts.map((value) => {
        let u: URL;
        try {
          u = new URL(value);
        } catch {
          throw new OnboardingError(
            "Use a full origin, such as https://example.org.",
          );
        }
        const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
        if (
          (u.protocol !== "https:" && !(local && u.protocol === "http:")) ||
          u.username ||
          u.password ||
          u.pathname !== "/" ||
          u.search ||
          u.hash ||
          u.hostname.includes("*")
        )
          throw new OnboardingError(
            "Use HTTPS origins without paths, credentials or wildcards. HTTP is allowed for localhost.",
          );
        return u.origin;
      }),
    ),
  ];
}
/** Lock one organisation's draft so stale tabs cannot confirm or replace a different wallet. */
async function updateSetup<T>(
  db: Db,
  orgId: string,
  fn: (tx: Db, s: Setup) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx
      .insert(organisationSettings)
      .values({ organisationId: orgId })
      .onConflictDoNothing();
    const [s] = await tx
      .select()
      .from(organisationSettings)
      .where(eq(organisationSettings.organisationId, orgId))
      .for("update");
    if (s!.completedAt) throw new OnboardingError("Setup is already complete.");
    return fn(tx, s!);
  });
}
export async function saveOrganisationDetails(
  db: Db,
  orgId: string,
  input: {
    name: string;
    registrationNumber: string;
    country: string;
    reportingCurrency: string;
  },
) {
  const name = clean(input.name, "organisation name", 200, 2);
  const registrationNumber = clean(
    input.registrationNumber,
    "registration number",
    100,
    0,
  );
  if (!countryCodes.includes(input.country))
    throw new OnboardingError("Choose a country.");
  if (
    !(reportingCurrencies as readonly string[]).includes(
      input.reportingCurrency,
    )
  )
    throw new OnboardingError("Choose a reporting currency.");
  await updateSetup(db, orgId, async (tx) => {
    await tx
      .update(organization)
      .set({ name })
      .where(eq(organization.id, orgId));
    await tx
      .update(organisationSettings)
      .set({
        registrationNumber,
        country: input.country,
        reportingCurrency: input.reportingCurrency,
      })
      .where(eq(organisationSettings.organisationId, orgId));
  });
}
export async function saveWalletDraft(
  db: Db,
  crypto: Crypto,
  orgId: string,
  input: string,
) {
  if (input.length > 5000)
    throw new OnboardingError("The wallet key or descriptor is too long.");
  const result = normaliseInput(input);
  if (
    (result.descriptor?.network ?? result.needsScriptType?.network) !==
    "mainnet"
  )
    throw new OnboardingError(
      "Use a mainnet wallet for this setup. Simulated donations do not need testnet bitcoin.",
    );
  if (result.descriptor && !result.descriptor.issuable)
    throw new OnboardingError(
      "Multisig descriptor recognised. Multisig receiving is not enabled yet; use a single-signature account to complete setup.",
    );
  if (result.descriptor) deriveAddress(result.descriptor, 0); // Validate curve point before storing.
  const encrypted = crypto.encrypt(
    result.descriptor?.canonical ?? result.needsScriptType!.xpub,
  );
  await updateSetup(db, orgId, async (tx, s) => {
    if (nextSetupStep(s) < 2)
      throw new OnboardingError("Save your organisation details first.");
    await tx
      .update(organisationSettings)
      .set({
        walletDraftEnc: encrypted,
        walletRevision: randomUUID(),
        walletConfirmed: false,
        freshCheckOverridden: false,
      })
      .where(eq(organisationSettings.organisationId, orgId));
  });
}
export async function chooseWalletScript(
  db: Db,
  crypto: Crypto,
  orgId: string,
  revision: string,
  script: Exclude<ScriptType, "wsh_sortedmulti">,
) {
  if (!["wpkh", "sh_wpkh", "tr"].includes(script))
    throw new OnboardingError("Choose an address type.");
  await updateSetup(db, orgId, async (tx, s) => {
    if (!s.walletDraftEnc || s.walletRevision !== revision)
      throw new OnboardingError("The wallet changed. Review it again.");
    const input = crypto.decrypt(s.walletDraftEnc);
    if (!normaliseInput(input).needsScriptType)
      throw new OnboardingError(
        "This wallet already specifies its address type.",
      );
    const p = normaliseInput(input, script).descriptor!;
    deriveAddress(p, 0);
    await tx
      .update(organisationSettings)
      .set({
        walletDraftEnc: crypto.encrypt(p.canonical),
        walletRevision: randomUUID(),
        walletConfirmed: false,
      })
      .where(eq(organisationSettings.organisationId, orgId));
  });
}
export async function inspectWallet(
  crypto: Crypto,
  s: Setup,
  chain: ChainSource,
) {
  if (!s.walletDraftEnc) return null;
  const result = normaliseInput(crypto.decrypt(s.walletDraftEnc));
  if (!result.descriptor) return { needsScriptType: true as const };
  const p = result.descriptor;
  const addresses = Array.from({ length: 20 }, (_, i) => deriveAddress(p, i));
  const histories = await Promise.all(addresses.map((a) => chain.history(a)));
  return {
    needsScriptType: false as const,
    address: addresses[0]!,
    scriptType: p.scriptType,
    used: histories.some((h) => h.length > 0),
  };
}
export async function confirmWallet(
  db: Db,
  crypto: Crypto,
  chain: ChainSource,
  orgId: string,
  revision: string,
  matched: boolean,
  override: boolean,
) {
  await updateSetup(db, orgId, async (tx, s) => {
    if (s.walletRevision !== revision || !matched)
      throw new OnboardingError("Confirm that address 0 matches your wallet.");
    const wallet = await inspectWallet(crypto, s, chain);
    if (!wallet || wallet.needsScriptType)
      throw new OnboardingError("Choose your wallet and address type first.");
    if (wallet.used && !override)
      throw new OnboardingError(
        "This account has history. Choose a fresh account or explicitly accept the warning.",
      );
    await tx
      .update(organisationSettings)
      .set({
        walletConfirmed: true,
        freshCheckOverridden: wallet.used && override,
      })
      .where(eq(organisationSettings.organisationId, orgId));
  });
}
export async function saveSender(
  db: Db,
  orgId: string,
  name: string,
  email: string,
) {
  const senderName = clean(name, "sender display name", 120);
  const replyTo = clean(email, "reply-to email", 254).toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(replyTo))
    throw new OnboardingError("Enter a valid reply-to email.");
  await updateSetup(db, orgId, async (tx, s) => {
    if (nextSetupStep(s) < 3)
      throw new OnboardingError("Confirm your wallet first.");
    await tx
      .update(organisationSettings)
      .set({ senderName, replyTo })
      .where(eq(organisationSettings.organisationId, orgId));
  });
}
export async function saveOrigins(db: Db, orgId: string, input: string) {
  const allowedOrigins = normaliseOrigins(input);
  await updateSetup(db, orgId, async (tx, s) => {
    if (nextSetupStep(s) < 4)
      throw new OnboardingError("Save your email sender first.");
    await tx
      .update(organisationSettings)
      .set({ allowedOrigins })
      .where(eq(organisationSettings.organisationId, orgId));
  });
}
export async function finishSetup(db: Db, crypto: Crypto, orgId: string) {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(organisationSettings)
      .where(eq(organisationSettings.organisationId, orgId))
      .for("update");
    if (s?.completedAt) return;
    if (!s || nextSetupStep(s) !== 5 || !s.walletDraftEnc)
      throw new OnboardingError("Complete each setup step first.");
    const p = parseDescriptor(crypto.decrypt(s.walletDraftEnc));
    const label = HDKey.fromExtendedKey(p.keys[0]!.xpub)
      .fingerprint.toString(16)
      .padStart(8, "0");
    await tx.insert(descriptors).values({
      organisationId: orgId,
      descriptorEnc: s.walletDraftEnc,
      scriptType: p.scriptType,
      network: p.network,
      label,
      freshCheckOverridden: s.freshCheckOverridden,
    });
    await tx
      .update(organisationSettings)
      .set({
        completedAt: new Date(),
        walletDraftEnc: null,
        walletRevision: null,
      })
      .where(eq(organisationSettings.organisationId, orgId));
  });
}
