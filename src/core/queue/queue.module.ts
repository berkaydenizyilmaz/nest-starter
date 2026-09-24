import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { PgBoss } from 'pg-boss';
import type { Env } from '../../config/env.schema.js';
import { PG_BOSS, QUEUE_POOL_MAX, QUEUE_SCHEMA } from './queue.constants.js';
import { QueueExplorer } from './queue.explorer.js';
import { QueueService } from './queue.service.js';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    {
      provide: PG_BOSS,
      inject: [ConfigService, PinoLogger],
      useFactory: (
        config: ConfigService<Env, true>,
        logger: PinoLogger,
      ): PgBoss => {
        const boss = new PgBoss({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          schema: QUEUE_SCHEMA,
          max: QUEUE_POOL_MAX,
          schedule: config.get('QUEUE_WORKERS_ENABLED', { infer: true }),
        });

        logger.setContext(PgBoss.name);
        boss.on('error', (error) =>
          logger.error({ err: error }, 'Queue error'),
        );

        return boss;
      },
    },
    QueueService,
    QueueExplorer,
  ],
  exports: [QueueService],
})
export class QueueModule {}
