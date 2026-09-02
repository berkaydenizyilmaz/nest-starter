import { z } from 'zod';
import { isoDate } from '../../../common/schemas/iso-date.schema.js';
import { cursorPageSchema } from '../../../common/schemas/pagination.schema.js';
import { AuditOutcome } from '../../../generated/prisma/client.js';

export const securityLogEntrySchema = z
  .object({
    id: z.string(),
    event: z.string(),
    outcome: z.enum(AuditOutcome),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: isoDate(),
  })
  .meta({ id: 'SecurityLogEntry' });

export const securityLogPageSchema = cursorPageSchema(securityLogEntrySchema).meta({
  id: 'SecurityLogPage',
});

export type SecurityLogPageInput = z.input<typeof securityLogPageSchema>;
