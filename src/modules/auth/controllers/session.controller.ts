import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  SerializeOptions,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiErrors } from '../../../common/decorators/api-errors.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../common/auth-user.type.js';
import {
  type SessionListInput,
  sessionListSchema,
  sessionResponseSchema,
  toSessionResponse,
} from '../dto/response/session.response.js';
import { SessionService } from '../services/session.service.js';

@ApiBearerAuth()
@Controller({ path: 'auth/sessions', version: '1' })
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  @SerializeOptions({ schema: sessionResponseSchema })
  @ApiOkResponse({ standardSchema: sessionListSchema })
  @ApiErrors(HttpStatus.UNAUTHORIZED)
  async list(@CurrentUser() user: AuthUser): Promise<SessionListInput> {
    const sessions = await this.sessions.listActive(user.id);
    return sessions.map((session) =>
      toSessionResponse(session, user.sessionId),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
  )
  revoke(
    @Param('id', { schema: z.uuid() }) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.sessions.revokeById(id, userId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors(HttpStatus.UNAUTHORIZED)
  revokeAll(@CurrentUser('id') userId: string): Promise<void> {
    return this.sessions.revokeAll(userId);
  }
}
