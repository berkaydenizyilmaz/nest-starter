import { Module } from '@nestjs/common';
import { AuditLogAdminController } from './audit-log-admin.controller.js';
import { AuditLogCleanupService } from './services/audit-log-cleanup.service.js';
import { AuditLogService } from './services/audit-log.service.js';

@Module({
  controllers: [AuditLogAdminController],
  providers: [AuditLogService, AuditLogCleanupService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
