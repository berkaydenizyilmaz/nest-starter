import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  buildCursorPage,
  buildOffsetPage,
} from '../../../common/utils/pagination.util.js';
import type { CursorQuery } from '../../../common/schemas/pagination.schema.js';
import type { AuditLog, Prisma } from '../../../generated/prisma/client.js';
import type { AuditLogQueryDto } from '../dto/audit-log-query.request.js';
import type { AuditLogPageInput } from '../dto/audit-log.response.js';
import type { SecurityLogPageInput } from '../dto/security-log.response.js';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditLogQueryDto): Promise<AuditLogPageInput> {
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

  async listForActor(
    actorId: string,
    query: CursorQuery,
  ): Promise<SecurityLogPageInput> {
    const rows = await this.prisma.auditLog.findMany({
      where: { actorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
    });

    return buildCursorPage(rows, query.limit, (row) => row.id);
  }

  private buildWhere(query: AuditLogQueryDto): Prisma.AuditLogWhereInput {
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
