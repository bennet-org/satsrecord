import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { accessRequests, type AccessRequestCountry } from './db/schema';
import type { MailAddress, Mailer } from './mail/types';

export interface AccessRequestInput {
  organisation: string;
  website?: string | undefined;
  name: string;
  email: string;
  country: AccessRequestCountry;
  message?: string | undefined;
}

const countryLabel: Record<AccessRequestCountry, string> = { GB: 'United Kingdom', US: 'United States', EU: 'EU member state', other: 'Other' };

export const ACCESS_REQUEST_NOTIFY_TEMPLATE = 'access-request-notify@1';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function accessRequestNotification(input: AccessRequestInput, id: string) {
  const rows: Array<[string, string]> = [
    ['Organisation', input.organisation],
    ['Website', input.website ?? ''],
    ['Name', input.name],
    ['Email', input.email],
    ['Registered in', countryLabel[input.country]],
    ['Message', input.message ?? ''],
    ['Request id', id],
  ];
  const text = `New access request\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n`;
  const html = `<h2>New access request</h2><table>${rows
    .map(([k, v]) => `<tr><th align="left" style="padding:4px 12px 4px 0">${k}</th><td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>`;
  return { subject: `Access request: ${input.organisation}`, text, html };
}

/**
 * Store the request, then notify. The row is written first so a mail failure loses nothing;
 * `notifiedAt` stays null and the request can be re-sent.
 */
export async function submitAccessRequest(
  db: Db,
  mailer: Mailer,
  input: AccessRequestInput,
  mail: { from: MailAddress; notify?: string | undefined },
) {
  const [row] = await db
    .insert(accessRequests)
    .values({ ...input, website: input.website || null, message: input.message || null })
    .returning({ id: accessRequests.id });
  const id = row!.id;

  if (mail.notify) {
    const n = accessRequestNotification(input, id);
    await mailer.send({ to: mail.notify, from: mail.from, replyTo: input.email, ...n, templateVersion: ACCESS_REQUEST_NOTIFY_TEMPLATE });
    await db.update(accessRequests).set({ notifiedAt: new Date() }).where(eq(accessRequests.id, id));
  }
  return { id };
}
