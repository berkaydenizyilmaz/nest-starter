import type {
  AuditOutcome,
  Prisma,
} from '../../generated/prisma/client.js';

export interface AuditRecordInput {
  event: string;
  outcome?: AuditOutcome;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}
