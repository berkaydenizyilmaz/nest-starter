import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { SessionController } from './controllers/session.controller.js';
import { PasswordService } from './services/password.service.js';
import { SessionService } from './services/session.service.js';
import { PasswordResetMailHandler } from './jobs/password-reset-mail.handler.js';
import { SessionCleanupHandler } from './jobs/session-cleanup.handler.js';

@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController, SessionController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    PasswordResetMailHandler,
    SessionCleanupHandler,
  ],
  exports: [SessionService],
})
export class AuthModule {}
