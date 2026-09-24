import type { PinoLogger } from 'nestjs-pino';
import type { MailMessage, MailTransport } from '../mail.types.js';

export class ConsoleMailTransport implements MailTransport {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ConsoleMailTransport.name);
  }

  send(from: string, message: MailMessage): Promise<void> {
    this.logger.info(
      { from, to: message.to, subject: message.subject, text: message.text },
      'Mail not sent, console driver',
    );
    return Promise.resolve();
  }
}
