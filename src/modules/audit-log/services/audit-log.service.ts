import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MS_PER_DAY } from '../../../common/constants/time.constants.js';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  buildCursorPage,
  buildOffsetPage,
  type CursorPage,
  type OffsetPage,
} from '../../../common/utils/pagination.util.js';
import type { CursorPageRequest } from '../../../common/schemas/pagination.schema.js';
import { type AuditLog, Prisma } from '../../../generated/prisma/client.js';
import type { ListAuditLogsRequest } from '../dto/list-audit-logs.request.js';

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async findAll(query: ListAuditLogsRequest): Promise<OffsetPage<AuditLog>> {
    const where = this.buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildOffsetPage(rows, query, total);
  }

  async findAllBySubject(
    subjectId: string,
    query: CursorPageRequest,
  ): Promise<CursorPage<AuditLog>> {
    const rows = await this.prisma.auditLog.findMany({
      where: { subjectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return buildCursorPage(rows, query.limit, (row) => row.id);
  }

  async removeExpired(): Promise<number> {
    const retentionDays = this.config.get('AUDIT_RETENTION_DAYS', {
      infer: true,
    });
    const threshold = new Date(Date.now() - retentionDays * MS_PER_DAY);

    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: threshold } },
    });

    return count;
  }

  async anonymize(
    userId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.auditLog.updateMany({
      where: {
        OR: [{ actorId: userId }, { subjectId: userId, actorId: null }],
      },
      data: { ip: null, userAgent: null },
    });
  }

  private buildWhere(query: ListAuditLogsRequest): Prisma.AuditLogWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lte = new Date(query.to);

    return {
      ...(query.event ? { event: query.event } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };
  }
}
