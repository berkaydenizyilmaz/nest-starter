import {
  Controller,
  Get,
  HttpStatus,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { HealthService } from './health.service.js';
import {
  type LivenessInput,
  livenessSchema,
  type ReadinessInput,
  readinessSchema,
} from './dto/health.response.js';

@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOkResponse({ standardSchema: livenessSchema })
  getLiveness(): LivenessInput {
    return { status: 'ok', uptime: this.health.uptimeSeconds() };
  }

  @Get('ready')
  @ApiOkResponse({ standardSchema: readinessSchema })
  @ApiServiceUnavailableResponse({ standardSchema: readinessSchema })
  async getReadiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessInput> {
    const database = await this.health.checkDatabase();
    const ready = database === 'up';

    response.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: ready ? 'ready' : 'not_ready',
      checks: { database },
    };
  }
}
