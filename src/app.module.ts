import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { toValidationError } from './common/utils/validation.util.js';
import { AuditModule } from './core/audit/audit.module.js';
import { AuditLogModule } from './modules/audit-log/audit-log.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { type Env, envSchema } from './config/env.schema.js';
import { HealthModule } from './modules/health/health.module.js';
import { UserModule } from './modules/user/user.module.js';
import { LoggerModule } from './core/logger.module.js';
import { PrismaModule } from './core/prisma/prisma.module.js';
import { RequestContextModule } from './core/request-context.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { RolesGuard } from './common/roles.guard.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { MS_PER_SECOND } from './common/constants/time.constants.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const enabled = config.get('THROTTLE_ENABLED', { infer: true });

        return {
          throttlers: [
            {
              ttl: config.get('THROTTLE_TTL', { infer: true }) * MS_PER_SECOND,
              limit: config.get('THROTTLE_LIMIT', { infer: true }),
            },
          ],
          skipIf: () => !enabled,
          errorMessage: 'Too many requests',
        };
      },
    }),
    RequestContextModule,
    LoggerModule,
    PrismaModule,
    AuditModule,
    AuditLogModule,
    AuthModule,
    UserModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: StandardSchemaSerializerInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: toValidationError,
      }),
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
