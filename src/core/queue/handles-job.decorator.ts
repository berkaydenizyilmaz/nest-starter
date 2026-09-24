import { DiscoveryService } from '@nestjs/core';
import type { JobDefinition } from './job.definition.js';

export const HandlesJob =
  DiscoveryService.createDecorator<JobDefinition<unknown>>();
