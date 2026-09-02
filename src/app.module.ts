import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { toValidationError } from './common/utils/validation.util.js';
import { AuditModule } from './core/audit/audit.module.js';
import { AuditLogModule } from './modules/audit/audit-log.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { envSchema } from './config/env.schema.js';
import { HealthModule } from './modules/health/health.module.js';
import { UserModule } from './modules/user/user.module.js';
import { LoggerModule } from './core/logger.module.js';
import { PrismaModule } from './core/prisma/prisma.module.js';
import { RequestContextModule } from './core/request-context.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { RolesGuard } from './common/roles.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
    }),
    ScheduleModule.forRoot(),
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
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
