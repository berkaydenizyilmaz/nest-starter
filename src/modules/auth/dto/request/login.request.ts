import { z } from 'zod';
import { emailAddress } from '../../../../common/schemas/email.schema.js';

export const loginRequestSchema = z
  .object({
    email: emailAddress(),
    password: z.string().min(1),
  })
  .strict()
  .meta({ id: 'LoginRequest' });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
