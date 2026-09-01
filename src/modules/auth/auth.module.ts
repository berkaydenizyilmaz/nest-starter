import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { SessionController } from './controllers/session.controller.js';
import { SessionService } from './services/session.service.js';
import { SessionCleanupService } from './services/session-cleanup.service.js';

@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController, SessionController],
  providers: [AuthService, SessionService, SessionCleanupService],
  exports: [SessionService],
})
export class AuthModule {}
