import { Module } from '@nestjs/common';
import { AuditLogAdminController } from './audit-log-admin.controller.js';
import { AuditLogService } from './audit-log.service.js';

@Module({
  controllers: [AuditLogAdminController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
