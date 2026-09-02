import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  SerializeOptions,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrors } from '../../common/decorators/api-errors.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  type CursorPageRequest,
  cursorPageRequestSchema,
} from '../../common/schemas/pagination.schema.js';
import { AuditLogService } from '../audit/services/audit-log.service.js';
import {
  type SecurityLogPageResponseInput,
  securityLogPageResponseSchema,
} from '../audit/dto/security-log.response.js';
import { type MeResponseInput, meResponseSchema } from './dto/me.response.js';
import { UserService } from './services/user.service.js';

@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly audit: AuditLogService,
  ) {}

  @Get('me')
  @SerializeOptions({ schema: meResponseSchema })
  @ApiOkResponse({ standardSchema: meResponseSchema })
  @ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND)
  getMe(@CurrentUser('id') userId: string): Promise<MeResponseInput> {
    return this.users.findById(userId);
  }

  @Get('me/security-log')
  @SerializeOptions({ schema: securityLogPageResponseSchema })
  @ApiOkResponse({ standardSchema: securityLogPageResponseSchema })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.UNAUTHORIZED)
  getMySecurityLog(
    @CurrentUser('id') userId: string,
    @Query({ schema: cursorPageRequestSchema }) query: CursorPageRequest,
  ): Promise<SecurityLogPageResponseInput> {
    return this.audit.findAllByActor(userId, query);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND)
  deleteMe(@CurrentUser('id') userId: string): Promise<void> {
    return this.users.remove(userId);
  }
}
