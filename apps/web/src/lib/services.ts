// Server-only singletons built from astro:env. Import from actions and on-demand pages only.
import { DATABASE_URL, RESEND_API_KEY, MAIL_FROM, NOTIFY_EMAIL, ENCRYPTION_KEY, INDEX_KEY } from 'astro:env/server';
import { createCrypto, createDb, createMailer, parseAddress, type Crypto } from '@satsrecord/core';

export const db = createDb(DATABASE_URL);
export const mailer = createMailer({ resendApiKey: RESEND_API_KEY });
export const mail = { from: parseAddress(MAIL_FROM), notify: NOTIFY_EMAIL };

let cryptoInstance: Crypto | undefined;
/** Lazy so the site runs without keys until a route actually stores PII or a descriptor. */
export function crypto(): Crypto {
  if (!cryptoInstance) {
    if (!ENCRYPTION_KEY || !INDEX_KEY) throw new Error('ENCRYPTION_KEY and INDEX_KEY must be set');
    cryptoInstance = createCrypto({ encryptionKey: ENCRYPTION_KEY, indexKey: INDEX_KEY });
  }
  return cryptoInstance;
}
