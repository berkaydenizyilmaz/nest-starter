import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService } from '@nestjs/core';
import { CLS_ID, ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import type { JobWithMetadata, PgBoss } from 'pg-boss';
import type { Env } from '../../config/env.schema.js';
import { HandlesJob } from './handles-job.decorator.js';
import type { JobDefinition, JobHandler } from './job.definition.js';
import { jobEnvelopeSchema } from './job-envelope.schema.js';
import { PG_BOSS, QUEUE_STOP_TIMEOUT_MS } from './queue.constants.js';

interface RegisteredJob {
  job: JobDefinition<unknown>;
  handler: JobHandler<unknown>;
}

@Injectable()
export class QueueExplorer implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    private readonly discovery: DiscoveryService,
    private readonly config: ConfigService<Env, true>,
    private readonly cls: ClsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QueueExplorer.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();

    const registered = this.discoverJobs();

    for (const { job } of registered) {
      await this.boss.createQueue(job.name, job.options);
      if (job.options) {
        await this.boss.updateQueue(job.name, job.options);
      }
    }

    await this.syncSchedules(registered.map(({ job }) => job));

    if (!this.config.get('QUEUE_WORKERS_ENABLED', { infer: true })) return;

    for (const { job, handler } of registered) {
      await this.boss.work(job.name, { includeMetadata: true }, (queued) =>
        this.process(job, handler, queued),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: QUEUE_STOP_TIMEOUT_MS });
  }

  private discoverJobs(): RegisteredJob[] {
    const registered = this.discovery
      .getProviders({ metadataKey: HandlesJob.KEY })
      .flatMap((wrapper) => {
        const job = this.discovery.getMetadataByDecorator(HandlesJob, wrapper);
        const handler: unknown = wrapper.instance;
        return job && isJobHandler(handler) ? [{ job, handler }] : [];
      });

    const names = registered.map(({ job }) => job.name);
    const duplicate = names.find(
      (name, index) => names.indexOf(name) !== index,
    );
    if (duplicate) {
      throw new Error(`Job "${duplicate}" has more than one handler`);
    }

    return registered;
  }

  private async syncSchedules(jobs: JobDefinition<unknown>[]): Promise<void> {
    const scheduled = new Set<string>();

    for (const job of jobs) {
      if (!job.schedule) continue;

      scheduled.add(job.name);
      await this.boss.schedule(
        job.name,
        job.schedule.cron,
        { payload: {} },
        { tz: job.schedule.timeZone },
      );
    }

    for (const existing of await this.boss.getSchedules()) {
      if (!scheduled.has(existing.name)) {
        await this.boss.unschedule(existing.name, existing.key);
      }
    }
  }

  private async process(
    job: JobDefinition<unknown>,
    handler: JobHandler<unknown>,
    queued: JobWithMetadata<unknown>[],
  ): Promise<void> {
    for (const entry of queued) {
      const startedAt = performance.now();
      let requestId: string | undefined;

      try {
        const envelope = jobEnvelopeSchema.parse(entry.data);
        requestId = envelope.requestId;

        await this.cls.run(async () => {
          if (envelope.requestId) {
            this.cls.set(CLS_ID, envelope.requestId);
          }
          await handler.handle(job.payload.parse(envelope.payload));
        });

        this.logger.info(
          {
            job: job.name,
            jobId: entry.id,
            requestId,
            durationMs: Math.round(performance.now() - startedAt),
          },
          'Job completed',
        );
      } catch (error) {
        const context = {
          err: error,
          job: job.name,
          jobId: entry.id,
          requestId,
          retryCount: entry.retryCount,
        };

        if (entry.retryCount >= entry.retryLimit) {
          this.logger.error(context, 'Job failed with no retries left');
        } else {
          this.logger.warn(context, 'Job failed, it will be retried');
        }

        throw error;
      }
    }
  }
}

function isJobHandler(value: unknown): value is JobHandler<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'handle' in value &&
    typeof value.handle === 'function'
  );
}
