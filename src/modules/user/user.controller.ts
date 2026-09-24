import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Query,
  SerializeOptions,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth-user.type.js';
import { ApiErrors } from '../../common/decorators/api-errors.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  type CursorPageRequest,
  cursorPageRequestSchema,
} from '../../common/schemas/pagination.schema.js';
import { AuditLogService } from '../audit-log/services/audit-log.service.js';
import {
  type SecurityLogPageResponseInput,
  securityLogPageResponseSchema,
} from './dto/security-log.response.js';
import { type MeResponseInput, meResponseSchema } from './dto/me.response.js';
import {
  type UpdateAvatarRequest,
  updateAvatarRequestSchema,
} from './dto/update-avatar.request.js';
import { UserService } from './services/user.service.js';

@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly auditLogs: AuditLogService,
  ) {}

  @Get('me')
  @SerializeOptions({ schema: meResponseSchema })
  @ApiOkResponse({ standardSchema: meResponseSchema })
  @ApiErrors(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  getMe(@CurrentUser('id') userId: string): Promise<MeResponseInput> {
    return this.users.findById(userId);
  }

  @Get('me/security-log')
  @SerializeOptions({ schema: securityLogPageResponseSchema })
  @ApiOkResponse({ standardSchema: securityLogPageResponseSchema })
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  getMySecurityLog(
    @CurrentUser('id') userId: string,
    @Query({ schema: cursorPageRequestSchema }) query: CursorPageRequest,
  ): Promise<SecurityLogPageResponseInput> {
    return this.auditLogs.findAllBySubject(userId, query);
  }

  @Put('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  updateMyAvatar(
    @CurrentUser() user: AuthUser,
    @Body({ schema: updateAvatarRequestSchema }) dto: UpdateAvatarRequest,
  ): Promise<void> {
    return this.users.updateAvatar({ actor: user, fileId: dto.fileId });
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  removeMyAvatar(@CurrentUser('id') userId: string): Promise<void> {
    return this.users.removeAvatar(userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  deleteMe(@CurrentUser('id') userId: string): Promise<void> {
    return this.users.remove(userId);
  }
}
