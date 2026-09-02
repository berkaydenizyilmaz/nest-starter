import { z } from 'zod';
import { isoDate } from '../../../common/schemas/iso-date.schema.js';
import { offsetPageResponseSchema } from '../../../common/schemas/pagination.schema.js';
import { AuditOutcome } from '../../../generated/prisma/client.js';

export const auditLogResponseSchema = z
  .object({
    id: z.string(),
    event: z.string(),
    outcome: z.enum(AuditOutcome),
    actorId: z.string().nullable(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    metadata: z.unknown().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    requestId: z.string().nullable(),
    createdAt: isoDate(),
  })
  .meta({ id: 'AuditLog' });

export const auditLogPageResponseSchema = offsetPageResponseSchema(
  auditLogResponseSchema,
).meta({
  id: 'AuditLogPage',
});

export type AuditLogPageResponseInput = z.input<
  typeof auditLogPageResponseSchema
>;
