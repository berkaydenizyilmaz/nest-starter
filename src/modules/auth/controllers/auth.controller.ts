import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  SerializeOptions,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrors } from '../../../common/decorators/api-errors.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { AuthService } from '../services/auth.service.js';
import {
  type LoginRequest,
  loginRequestSchema,
} from '../dto/request/login.request.js';
import {
  type RefreshRequest,
  refreshRequestSchema,
} from '../dto/request/refresh.request.js';
import {
  type RegisterRequest,
  registerRequestSchema,
} from '../dto/request/register.request.js';
import {
  type LoginResponseInput,
  loginResponseSchema,
} from '../dto/response/login.response.js';
import {
  type TokenPairResponseInput,
  tokenPairResponseSchema,
} from '../dto/response/token-pair.response.js';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @SerializeOptions({ schema: tokenPairResponseSchema })
  @ApiCreatedResponse({ standardSchema: tokenPairResponseSchema })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.CONFLICT)
  register(
    @Body({ schema: registerRequestSchema }) dto: RegisterRequest,
  ): Promise<TokenPairResponseInput> {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @SerializeOptions({ schema: loginResponseSchema })
  @ApiOkResponse({ standardSchema: loginResponseSchema })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.UNAUTHORIZED)
  login(
    @Body({ schema: loginRequestSchema }) dto: LoginRequest,
  ): Promise<LoginResponseInput> {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @SerializeOptions({ schema: tokenPairResponseSchema })
  @ApiOkResponse({ standardSchema: tokenPairResponseSchema })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.UNAUTHORIZED)
  refresh(
    @Body({ schema: refreshRequestSchema }) dto: RefreshRequest,
  ): Promise<TokenPairResponseInput> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY)
  logout(
    @Body({ schema: refreshRequestSchema }) dto: RefreshRequest,
  ): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }
}
