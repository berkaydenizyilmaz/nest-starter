import { z } from 'zod';
import {
  isoDate,
  nullableIsoDate,
} from '../../../common/schemas/iso-date.schema.js';
import { storedFileResponseSchema } from '../../../common/schemas/stored-file.schema.js';
import { Role } from '../../../generated/prisma/client.js';

export const meResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    role: z.enum(Role),
    createdAt: isoDate(),
    lastLoginAt: nullableIsoDate(),
    avatar: storedFileResponseSchema.nullable(),
  })
  .meta({ id: 'Me' });

export type MeResponseInput = z.input<typeof meResponseSchema>;
