import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  SerializeOptions,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrors } from '../../common/decorators/api-errors.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { type MeResponseInput, meResponseSchema } from './dto/me.response.js';
import { UserService } from './user.service.js';

@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  @SerializeOptions({ schema: meResponseSchema })
  @ApiOkResponse({ standardSchema: meResponseSchema })
  @ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND)
  getMe(@CurrentUser('id') userId: string): Promise<MeResponseInput> {
    return this.users.findById(userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND)
  deleteMe(@CurrentUser('id') userId: string): Promise<void> {
    return this.users.deleteAccount(userId);
  }
}
