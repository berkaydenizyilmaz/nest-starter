import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { HandlesJob } from '../../../core/queue/handles-job.decorator.js';
import type {
  JobHandler,
  JobPayload,
} from '../../../core/queue/job.definition.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { auditLogCleanupJob } from './audit-log-cleanup.job.js';

@HandlesJob(auditLogCleanupJob)
@Injectable()
export class AuditLogCleanupHandler implements JobHandler<
  JobPayload<typeof auditLogCleanupJob>
> {
  constructor(
    private readonly auditLogs: AuditLogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditLogCleanupHandler.name);
  }

  async handle(): Promise<void> {
    const deleted = await this.auditLogs.removeExpired();
    this.logger.info({ deleted }, 'Expired audit logs removed');
  }
}
