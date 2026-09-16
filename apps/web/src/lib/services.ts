// Server-only singletons built from astro:env. Import from actions and on-demand pages only.
import { DATABASE_URL, RESEND_API_KEY, MAIL_FROM, NOTIFY_EMAIL } from 'astro:env/server';
import { createDb, createMailer, parseAddress } from '@satsrecord/core';

export const db = createDb(DATABASE_URL);
export const mailer = createMailer({ resendApiKey: RESEND_API_KEY });
export const mail = { from: parseAddress(MAIL_FROM), notify: NOTIFY_EMAIL };
