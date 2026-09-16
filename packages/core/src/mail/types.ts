export interface MailAddress { name?: string; address: string }

export interface MailMessage {
  to: string;
  from: MailAddress;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  /** Recorded on the row that caused the send, e.g. "acknowledgement@3". */
  templateVersion: string;
}

export interface Mailer {
  readonly name: string;
  send(msg: MailMessage): Promise<{ providerMessageId: string }>;
}

export function formatAddress(a: MailAddress) {
  return a.name ? `${a.name.replace(/"/g, '')} <${a.address}>` : a.address;
}

/** Parse "Name <addr>" or a bare address. */
export function parseAddress(s: string): MailAddress {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(s);
  return m ? { name: m[1]?.trim() || undefined, address: m[2]!.trim() } : { address: s.trim() };
}
