import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FileModule } from '../file/file.module.js';
import { USER_FILE_PURPOSE } from './user.constants.js';
import { UserController } from './user.controller.js';
import { UserService } from './services/user.service.js';
import { UserAnonymizationService } from './services/user-anonymization.service.js';
import { UserAnonymizationHandler } from './jobs/user-anonymization.handler.js';

@Module({
  imports: [
    AuditLogModule,
    AuthModule,
    FileModule.forFeature([USER_FILE_PURPOSE.USER_AVATAR]),
  ],
  controllers: [UserController],
  providers: [UserService, UserAnonymizationService, UserAnonymizationHandler],
})
export class UserModule {}
