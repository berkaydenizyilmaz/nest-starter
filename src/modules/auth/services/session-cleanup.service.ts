import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  APP_TIMEZONE,
  MS_PER_DAY,
} from '../../../common/constants/time.constants.js';
import type { Env } from '../../../config/env.schema.js';

@Injectable()
export class SessionCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SessionCleanupService.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'session-cleanup',
    timeZone: APP_TIMEZONE,
  })
  async handleCron(): Promise<void> {
    if (!this.config.get('CRON_ENABLED', { infer: true })) {
      return;
    }

    const startedAt = performance.now();
    const retentionDays = this.config.get('SESSION_CLEANUP_RETENTION_DAYS', {
      infer: true,
    });
    const threshold = new Date(Date.now() - retentionDays * MS_PER_DAY);

    try {
      const { count } = await this.prisma.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: threshold } },
            { revokedAt: { lt: threshold } },
          ],
        },
      });

      const durationMs = Math.round(performance.now() - startedAt);
      this.logger.info(
        `Session cleanup done | deleted=${count} duration=${durationMs}ms`,
      );
    } catch (error) {
      this.logger.error({ err: error }, 'Session cleanup failed');
    }
  }
}
