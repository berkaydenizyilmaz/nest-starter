import { Global, Module } from '@nestjs/common';
import { OneTimeTokenService } from './one-time-token.service.js';

@Global()
@Module({
  providers: [OneTimeTokenService],
  exports: [OneTimeTokenService],
})
export class OneTimeTokenModule {}
