import { Module } from '@nestjs/common';
import { AuditLogAdminController } from './audit-log-admin.controller.js';
import { AuditLogCleanupHandler } from './jobs/audit-log-cleanup.handler.js';
import { AuditLogService } from './services/audit-log.service.js';

@Module({
  controllers: [AuditLogAdminController],
  providers: [AuditLogService, AuditLogCleanupHandler],
  exports: [AuditLogService],
})
export class AuditLogModule {}
