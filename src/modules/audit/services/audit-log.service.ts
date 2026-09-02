import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  buildCursorPage,
  buildOffsetPage,
} from '../../../common/utils/pagination.util.js';
import type { CursorPageRequest } from '../../../common/schemas/pagination.schema.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { ListAuditLogsRequest } from '../dto/list-audit-logs.request.js';
import type { AuditLogPageResponseInput } from '../dto/audit-log.response.js';
import type { SecurityLogPageResponseInput } from '../dto/security-log.response.js';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListAuditLogsRequest,
  ): Promise<AuditLogPageResponseInput> {
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

  async findAllByActor(
    actorId: string,
    query: CursorPageRequest,
  ): Promise<SecurityLogPageResponseInput> {
    const rows = await this.prisma.auditLog.findMany({
      where: { actorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return buildCursorPage(rows, query.limit, (row) => row.id);
  }

  async anonymize(
    actorId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.auditLog.updateMany({
      where: { actorId },
      data: { ip: null, userAgent: null, metadata: Prisma.DbNull },
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
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };
  }
}
