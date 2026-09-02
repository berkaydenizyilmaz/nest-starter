import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit/audit-log.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UserController } from './user.controller.js';
import { UserService } from './services/user.service.js';
import { UserAnonymizationService } from './services/user-anonymization.service.js';

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [UserController],
  providers: [UserService, UserAnonymizationService],
})
export class UserModule {}
