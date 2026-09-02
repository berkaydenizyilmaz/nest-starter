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
  type SessionListResponseInput,
  sessionListResponseSchema,
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
  @ApiOkResponse({ standardSchema: sessionListResponseSchema })
  @ApiErrors(HttpStatus.UNAUTHORIZED)
  async listSessions(
    @CurrentUser() user: AuthUser,
  ): Promise<SessionListResponseInput> {
    const sessions = await this.sessions.findAllActive(user.id);
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
  revokeSession(
    @Param('id', { schema: z.uuid() }) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.sessions.revokeById(id, userId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors(HttpStatus.UNAUTHORIZED)
  revokeAllSessions(@CurrentUser('id') userId: string): Promise<void> {
    return this.sessions.revokeAll(userId);
  }
}
