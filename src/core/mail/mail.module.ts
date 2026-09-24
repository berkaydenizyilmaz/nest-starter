import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';
import { MAIL_TRANSPORT } from './mail.constants.js';
import { MailService } from './mail.service.js';
import type { MailTransport } from './mail.types.js';
import { ConsoleMailTransport } from './transports/console-mail.transport.js';
import { ResendMailTransport } from './transports/resend-mail.transport.js';

@Global()
@Module({
  providers: [
    MailService,
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService, PinoLogger],
      useFactory: (
        config: ConfigService<Env, true>,
        logger: PinoLogger,
      ): MailTransport => {
        if (config.get('MAIL_DRIVER', { infer: true }) === 'console') {
          return new ConsoleMailTransport(logger);
        }

        const apiKey = config.get('RESEND_API_KEY', { infer: true });
        if (!apiKey) {
          throw new Error(
            'RESEND_API_KEY is required when MAIL_DRIVER is resend',
          );
        }
        return new ResendMailTransport(apiKey);
      },
    },
  ],
  exports: [MailService],
})
export class MailModule {}
