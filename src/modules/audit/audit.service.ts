import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { AuditOutcome, Prisma } from '../../generated/prisma/client.js';
import type { AuditRecordInput } from './audit.types.js';

interface RequestFields {
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async record(
    input: AuditRecordInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const request = this.requestFields();

    await client.auditLog.create({
      data: {
        event: input.event,
        outcome: input.outcome ?? AuditOutcome.SUCCESS,
        actorId: input.actorId ?? request.actorId,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
        ip: request.ip,
        userAgent: request.userAgent,
        requestId: request.requestId,
      },
    });
  }

  private requestFields(): RequestFields {
    if (!this.cls.isActive()) return {};

    return {
      actorId: this.cls.get('user')?.id,
      ip: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
      requestId: this.cls.getId(),
    };
  }
}
