// Server-only singletons built from astro:env. Import from actions, middleware and on-demand pages only.
import {
  DATABASE_URL,
  RESEND_API_KEY,
  MAIL_FROM,
  NOTIFY_EMAIL,
  ENCRYPTION_KEY,
  INDEX_KEY,
  APP_URL,
  BETTER_AUTH_SECRET,
  OPERATOR_EMAILS,
  DEV_OUTBOX,
  DEV_OUTBOX_PASSWORD,
  OPEN_SIGNUP,
  SIMULATE_DONATIONS,
} from "astro:env/server";
import {
  ConsoleMailer,
  FakeChainSource,
  createAuth,
  createCrypto,
  createDb,
  createMailer,
  normaliseEmail,
  parseAddress,
  type Crypto,
} from "@satsrecord/core";
import { site } from "../data/marketing";

export const db = createDb(DATABASE_URL);
export const mailer = createMailer({ resendApiKey: RESEND_API_KEY });
export const mail = { from: parseAddress(MAIL_FROM), notify: NOTIFY_EMAIL };
export const appUrl = APP_URL.replace(/\/$/, "");
export const openSignup = OPEN_SIGNUP;

export const operatorEmails = new Set(
  (OPERATOR_EMAILS ?? "")
    .split(",")
    .map((e) => normaliseEmail(e))
    .filter(Boolean),
);

export const auth = createAuth({
  db,
  mailer,
  from: mail.from,
  appUrl,
  appName: site.name,
  secret: BETTER_AUTH_SECRET,
  openSignup: OPEN_SIGNUP,
  operatorEmails,
});

/**
 * The loopback APP_URL is a configuration guard, not a network boundary.
 * The page also requires separate Basic authentication before exposing sign-in links.
 */
const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
  new URL(appUrl).hostname,
);
export const outbox =
  DEV_OUTBOX &&
  loopback &&
  (DEV_OUTBOX_PASSWORD?.length ?? 0) >= 32 &&
  mailer instanceof ConsoleMailer
    ? mailer
    : null;
export const outboxPassword = DEV_OUTBOX_PASSWORD;

let cryptoInstance: Crypto | undefined;
/** Lazy so the site runs without keys until a route actually stores PII or a descriptor. */
export function crypto(): Crypto {
  if (!cryptoInstance) {
    if (!ENCRYPTION_KEY || !INDEX_KEY)
      throw new Error("ENCRYPTION_KEY and INDEX_KEY must be set");
    cryptoInstance = createCrypto({
      encryptionKey: ENCRYPTION_KEY,
      indexKey: INDEX_KEY,
    });
  }
  return cryptoInstance;
}

export const chain = new FakeChainSource();
export const simulateDonations = SIMULATE_DONATIONS;
