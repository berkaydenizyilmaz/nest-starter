import { z } from 'zod';
import { Role } from '../../generated/prisma/client.js';

export const accessTokenPayloadSchema = z.object({
  sub: z.uuid(),
  role: z.enum(Role),
  sid: z.uuid(),
});

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;
