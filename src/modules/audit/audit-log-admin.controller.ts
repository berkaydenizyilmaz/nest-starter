import { Controller, Get, HttpStatus, Query, SerializeOptions } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrors } from '../../common/decorators/api-errors.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import { AuditLogService } from './audit-log.service.js';
import {
  type AuditLogQueryDto,
  auditLogQuerySchema,
} from './dto/audit-log-query.request.js';
import {
  type AuditLogPageInput,
  auditLogPageSchema,
} from './dto/audit-log.response.js';

@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'admin/audit-logs', version: '1' })
export class AuditLogAdminController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @SerializeOptions({ schema: auditLogPageSchema })
  @ApiOkResponse({ standardSchema: auditLogPageSchema })
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  listAuditLogs(
    @Query({ schema: auditLogQuerySchema }) query: AuditLogQueryDto,
  ): Promise<AuditLogPageInput> {
    return this.audit.list(query);
  }
}
