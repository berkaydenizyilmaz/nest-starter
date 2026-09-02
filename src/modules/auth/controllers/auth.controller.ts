import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  SerializeOptions,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrors } from '../../../common/decorators/api-errors.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import {
  AUTH_THROTTLE_LIMIT,
  AUTH_THROTTLE_TTL_MS,
} from '../auth.constants.js';
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
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT },
  })
  @SerializeOptions({ schema: tokenPairResponseSchema })
  @ApiCreatedResponse({ standardSchema: tokenPairResponseSchema })
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.CONFLICT,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  register(
    @Body({ schema: registerRequestSchema }) dto: RegisterRequest,
  ): Promise<TokenPairResponseInput> {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT },
  })
  @SerializeOptions({ schema: loginResponseSchema })
  @ApiOkResponse({ standardSchema: loginResponseSchema })
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  login(
    @Body({ schema: loginRequestSchema }) dto: LoginRequest,
  ): Promise<LoginResponseInput> {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT },
  })
  @SerializeOptions({ schema: tokenPairResponseSchema })
  @ApiOkResponse({ standardSchema: tokenPairResponseSchema })
  @ApiErrors(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  refresh(
    @Body({ schema: refreshRequestSchema }) dto: RefreshRequest,
  ): Promise<TokenPairResponseInput> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.TOO_MANY_REQUESTS)
  logout(
    @Body({ schema: refreshRequestSchema }) dto: RefreshRequest,
  ): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }
}
