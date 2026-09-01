import { z } from 'zod';
import {
  isoDate,
  nullableIsoDate,
} from '../../../common/schemas/iso-date.schema.js';
import { Role } from '../../../generated/prisma/client.js';

export const meResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    role: z.enum(Role),
    createdAt: isoDate(),
    lastLoginAt: nullableIsoDate(),
  })
  .meta({ id: 'Me' });

export type MeResponseInput = z.input<typeof meResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
