import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { fromPrisma, type PgBoss } from 'pg-boss';
import type { Prisma } from '../../generated/prisma/client.js';
import type { JobDefinition } from './job.definition.js';
import type { JobEnvelope } from './job-envelope.schema.js';
import { PG_BOSS } from './queue.constants.js';

@Injectable()
export class QueueService {
  constructor(
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    private readonly cls: ClsService,
  ) {}

  async send<TPayload>(
    job: JobDefinition<TPayload>,
    payload: TPayload,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const envelope: JobEnvelope = {
      requestId: this.cls.isActive() ? this.cls.getId() : undefined,
      payload: job.payload.parse(payload),
    };

    await this.boss.send(
      job.name,
      envelope,
      client ? { db: fromPrisma(client) } : undefined,
    );
  }
}
