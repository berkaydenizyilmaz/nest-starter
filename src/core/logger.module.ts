import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { Env } from '../config/env.schema.js';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService, ClsService],
      useFactory: (config: ConfigService<Env, true>, cls: ClsService) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';

        return {
          assignResponse: true,
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),

            genReqId: () => cls.getId(),

            customLogLevel: (_req, res, error) => {
              if (error || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },

            serializers: {
              req: (req) => ({
                id: req.id,
                method: req.method,
                url: req.url,
                ip: req.raw.ip,
                userAgent: req.headers['user-agent'],
              }),
              res: (res) => ({ statusCode: res.statusCode }),
            },

            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie'],
              remove: true,
            },

            transport: isDev
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
