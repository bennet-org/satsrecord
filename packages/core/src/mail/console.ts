import type { Mailer, MailMessage } from "./types";
import { formatAddress } from "./types";

/** Development mailer. Prints the message and returns a fake id. */
export class ConsoleMailer implements Mailer {
  readonly name = "console";
  readonly sent: MailMessage[] = [];
  constructor(
    private readonly log: (line: string) => void = (l) => console.log(l),
  ) {}
  async send(msg: MailMessage) {
    this.sent.push(msg);
    this.log(
      `[mail] to=${msg.to} from=${formatAddress(msg.from)} subject=${JSON.stringify(msg.subject)} template=${msg.templateVersion}\n${msg.text}`,
    );
    return { providerMessageId: `console-${this.sent.length}` };
  }
}
