import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  APP_TIMEZONE,
  MS_PER_DAY,
} from '../../../common/constants/time.constants.js';
import type { Env } from '../../../config/env.schema.js';

@Injectable()
export class AuditLogCleanupService {
  private readonly logger = new Logger(AuditLogCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, {
    name: 'audit-log-cleanup',
    timeZone: APP_TIMEZONE,
  })
  async handleCron(): Promise<void> {
    if (!this.config.get('CRON_CLEANUP_ENABLED', { infer: true })) {
      return;
    }

    const startedAt = performance.now();
    const retentionDays = this.config.get('AUDIT_RETENTION_DAYS', {
      infer: true,
    });
    const threshold = new Date(Date.now() - retentionDays * MS_PER_DAY);

    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: threshold } },
    });

    const durationMs = Math.round(performance.now() - startedAt);
    this.logger.log(
      `Audit log cleanup done | deleted=${count} duration=${durationMs}ms`,
    );
  }
}
