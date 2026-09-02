import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserService } from './user.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import { AuditLogService } from '../../audit-log/services/audit-log.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { USER_AUDIT } from '../user.constants.js';
import {
  APP_TIMEZONE,
  MS_PER_DAY,
} from '../../../common/constants/time.constants.js';
import type { Env } from '../../../config/env.schema.js';

const ANONYMIZATION_BATCH_SIZE = 500;

@Injectable()
export class UserAnonymizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly users: UserService,
    private readonly sessions: SessionService,
    private readonly auditLogs: AuditLogService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UserAnonymizationService.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM, {
    name: 'user-anonymization',
    timeZone: APP_TIMEZONE,
  })
  async handleCron(): Promise<void> {
    if (!this.config.get('CRON_ENABLED', { infer: true })) {
      return;
    }

    const startedAt = performance.now();
    const retentionDays = this.config.get('USER_ANONYMIZATION_AFTER_DAYS', {
      infer: true,
    });
    const threshold = new Date(Date.now() - retentionDays * MS_PER_DAY);

    try {
      const { processed, total } = await this.anonymizeDue(threshold);

      const durationMs = Math.round(performance.now() - startedAt);
      this.logger.info(
        `User anonymization done | processed=${processed}/${total} duration=${durationMs}ms`,
      );
    } catch (error) {
      this.logger.error({ err: error }, 'User anonymization failed');
    }
  }

  private async anonymizeDue(
    threshold: Date,
  ): Promise<{ processed: number; total: number }> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: { lt: threshold },
        anonymizedAt: null,
      },
      select: { id: true },
      take: ANONYMIZATION_BATCH_SIZE,
    });

    let processed = 0;

    for (const { id } of users) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.sessions.anonymize(id, tx);
          await this.auditLogs.anonymize(id, tx);
          await this.users.anonymize(id, tx);

          await this.audit.record(
            {
              event: USER_AUDIT.USER_ANONYMIZED,
              targetType: AUDIT_TARGET.USER,
              targetId: id,
            },
            tx,
          );
        });
        processed++;
      } catch (error) {
        this.logger.error({ err: error }, `Failed to anonymize user ${id}`);
      }
    }

    return { processed, total: users.length };
  }
}
