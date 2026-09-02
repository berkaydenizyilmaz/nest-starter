import {
  Controller,
  Get,
  HttpStatus,
  Query,
  SerializeOptions,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrors } from '../../common/decorators/api-errors.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import { AuditLogService } from './services/audit-log.service.js';
import {
  type ListAuditLogsRequest,
  listAuditLogsRequestSchema,
} from './dto/list-audit-logs.request.js';
import {
  type AuditLogPageResponseInput,
  auditLogPageResponseSchema,
} from './dto/audit-log.response.js';

@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'admin/audit-logs', version: '1' })
export class AuditLogAdminController {
  constructor(private readonly auditLogs: AuditLogService) {}

  @Get()
  @SerializeOptions({ schema: auditLogPageResponseSchema })
  @ApiOkResponse({ standardSchema: auditLogPageResponseSchema })
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  listAuditLogs(
    @Query({ schema: listAuditLogsRequestSchema }) query: ListAuditLogsRequest,
  ): Promise<AuditLogPageResponseInput> {
    return this.auditLogs.findAll(query);
  }
}
