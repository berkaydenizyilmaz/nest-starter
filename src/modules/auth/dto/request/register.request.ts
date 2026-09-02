import { z } from 'zod';
import { emailAddress } from '../../../../common/schemas/email.schema.js';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../auth.constants.js';

export const registerRequestSchema = z
  .object({
    email: emailAddress(),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .strict()
  .meta({ id: 'RegisterRequest' });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
