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
import { type LoginDto, loginSchema } from '../dto/request/login.request.js';
import {
  type RefreshDto,
  refreshSchema,
} from '../dto/request/refresh.request.js';
import {
  type RegisterDto,
  registerSchema,
} from '../dto/request/register.request.js';
import {
  type LoginResponseInput,
  loginResponseSchema,
} from '../dto/response/login.response.js';
import {
  type TokenPairResponseInput,
  tokenPairSchema,
} from '../dto/response/token-pair.response.js';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @SerializeOptions({ schema: tokenPairSchema })
  @ApiCreatedResponse({ standardSchema: tokenPairSchema })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.CONFLICT)
  register(
    @Body({ schema: registerSchema }) dto: RegisterDto,
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
    @Body({ schema: loginSchema }) dto: LoginDto,
  ): Promise<LoginResponseInput> {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @SerializeOptions({ schema: tokenPairSchema })
  @ApiOkResponse({ standardSchema: tokenPairSchema })
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY, HttpStatus.UNAUTHORIZED)
  refresh(
    @Body({ schema: refreshSchema }) dto: RefreshDto,
  ): Promise<TokenPairResponseInput> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiErrors(HttpStatus.UNPROCESSABLE_ENTITY)
  logout(@Body({ schema: refreshSchema }) dto: RefreshDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }
}
