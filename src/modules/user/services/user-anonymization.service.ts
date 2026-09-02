import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserService } from './user.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import { AuditLogService } from '../../audit/services/audit-log.service.js';
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
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM, {
    name: 'user-anonymization',
    timeZone: APP_TIMEZONE,
  })
  async handleCron(): Promise<void> {
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
          await this.sessionService.anonymize(id, tx);
          await this.auditLogService.anonymize(id, tx);
          await this.userService.anonymize(id, tx);
        });
        successCount++;
      } catch (error) {
        this.logger.error(
          `Failed to anonymize user ${id}`,
          (error as Error).stack,
        );
      }
    }

    const durationMs = Math.round(performance.now() - startedAt);
    this.logger.log(
      `User anonymization done | processed=${successCount}/${users.length} duration=${durationMs}ms`,
    );
  }
}
