import { Resend } from 'resend';
import type { MailMessage, MailTransport } from '../mail.types.js';

export class ResendMailTransport implements MailTransport {
  private readonly resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(from: string, message: MailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      throw new Error(
        `Resend rejected the mail: ${error.name} (${error.statusCode ?? 'no status'}) ${error.message}`,
      );
    }
  }
}
