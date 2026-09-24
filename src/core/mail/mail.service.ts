import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { MAIL_TRANSPORT } from './mail.constants.js';
import type { MailMessage, MailTransport } from './mail.types.js';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly config: ConfigService<Env, true>,
  ) {}

  send(message: MailMessage): Promise<void> {
    return this.transport.send(
      this.config.get('MAIL_FROM', { infer: true }),
      message,
    );
  }
}
