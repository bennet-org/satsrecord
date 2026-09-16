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
  OPEN_SIGNUP,
} from "astro:env/server";
import {
  ConsoleMailer,
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

/** Sent mail, when the console mailer is in use and the outbox page is switched on. */
export const outbox =
  DEV_OUTBOX && mailer instanceof ConsoleMailer ? mailer : null;

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

/** Only same-site paths are allowed as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/app") {
  return next && /^\/(?!\/)/.test(next) ? next : fallback;
}
