import { z } from 'zod';
import { emailAddress } from '../../../../common/schemas/email.schema.js';

export const forgotPasswordRequestSchema = z
  .object({
    email: emailAddress(),
  })
  .strict()
  .meta({ id: 'ForgotPasswordRequest' });

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
