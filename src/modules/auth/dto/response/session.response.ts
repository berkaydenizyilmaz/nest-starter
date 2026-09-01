import { z } from 'zod';
import { isoDate } from '../../../../common/schemas/iso-date.schema.js';

export const sessionResponseSchema = z
  .object({
    id: z.string(),
    device: z.string().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    isCurrent: z.boolean(),
    lastUsedAt: isoDate(),
    createdAt: isoDate(),
  })
  .meta({ id: 'Session' });

export const sessionListSchema = z.array(sessionResponseSchema);

export type SessionResponseInput = z.input<typeof sessionResponseSchema>;
export type SessionListInput = z.input<typeof sessionListSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export function toSessionResponse(
  session: {
    id: string;
    device: string | null;
    ip: string | null;
    userAgent: string | null;
    lastUsedAt: Date;
    createdAt: Date;
  },
  currentSessionId: string,
): SessionResponseInput {
  return {
    id: session.id,
    device: session.device,
    ip: session.ip,
    userAgent: session.userAgent,
    isCurrent: session.id === currentSessionId,
    lastUsedAt: session.lastUsedAt,
    createdAt: session.createdAt,
  };
}
