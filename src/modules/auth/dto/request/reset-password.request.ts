import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../auth.constants.js';

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .strict()
  .meta({ id: 'ResetPasswordRequest' });

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
