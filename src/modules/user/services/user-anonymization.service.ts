import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { UserService } from './user.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import { AuditLogService } from '../../audit-log/services/audit-log.service.js';
import { FileService } from '../../file/services/file.service.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { USER_AUDIT } from '../user.constants.js';
import { MS_PER_DAY } from '../../../common/constants/time.constants.js';
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
    private readonly files: FileService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UserAnonymizationService.name);
  }

  async anonymizeDue(): Promise<{ processed: number; total: number }> {
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
      take: ANONYMIZATION_BATCH_SIZE,
    });

    let processed = 0;

    for (const { id } of users) {
      try {
        const anonymized = await this.prisma.$transaction(async (tx) => {
          const due = await this.users.anonymize(id, threshold, tx);
          if (!due) return false;

          await this.sessions.anonymize(id, tx);
          await this.auditLogs.anonymize(id, tx);
          await this.files.anonymizeOwner(id, tx);

          await this.audit.record(
            {
              event: USER_AUDIT.USER_ANONYMIZED,
              subjectId: id,
              targetType: AUDIT_TARGET.USER,
              targetId: id,
            },
            tx,
          );
          return true;
        });
        if (anonymized) processed++;
      } catch (error) {
        this.logger.error(
          { err: error, userId: id },
          'Failed to anonymize user',
        );
      }
    }

    return { processed, total: users.length };
  }
}
