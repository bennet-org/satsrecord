import type { Mailer, MailMessage } from "./types";
import { formatAddress } from "./types";

/** Resend over plain fetch. No SDK: one endpoint, one shape. */
export class ResendMailer implements Mailer {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(msg: MailMessage) {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: formatAddress(msg.from),
        to: [msg.to],
        reply_to: msg.replyTo,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        tags: [
          {
            name: "template",
            value: msg.templateVersion.replace(/[^a-zA-Z0-9_-]/g, "_"),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { id: string };
    return { providerMessageId: body.id };
  }
}
