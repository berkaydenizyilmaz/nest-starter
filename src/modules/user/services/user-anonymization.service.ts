import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserService } from './user.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import { AuditLogService } from '../../audit/services/audit-log.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { USER_AUDIT } from '../user.constants.js';
import {
  APP_TIMEZONE,
  MS_PER_DAY,
} from '../../../common/constants/time.constants.js';
import type { Env } from '../../../config/env.schema.js';

@Injectable()
export class UserAnonymizationService {
  private readonly logger = new Logger(UserAnonymizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly users: UserService,
    private readonly sessions: SessionService,
    private readonly auditLogs: AuditLogService,
    private readonly audit: AuditService,
  ) {}

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

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: { lt: threshold },
        anonymizedAt: null,
      },
      select: { id: true },
    });

    let successCount = 0;

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
        successCount++;
      } catch (error) {
        this.logger.error(
          `Failed to anonymize user ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    const durationMs = Math.round(performance.now() - startedAt);
    this.logger.log(
      `User anonymization done | processed=${successCount}/${users.length} duration=${durationMs}ms`,
    );
  }
}
