import { ConsoleMailer } from './console';
import { ResendMailer } from './resend';
import type { Mailer } from './types';

export * from './types';
export { ConsoleMailer, ResendMailer };

/** Resend when a key is present, console otherwise. SMTP arrives with self-host packaging. */
export function createMailer(opts: { resendApiKey?: string | undefined }): Mailer {
  return opts.resendApiKey ? new ResendMailer(opts.resendApiKey) : new ConsoleMailer();
}
