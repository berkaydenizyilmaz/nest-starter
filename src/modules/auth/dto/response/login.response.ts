import { z } from 'zod';
import { tokenPairResponseSchema } from './token-pair.response.js';

export const loginResponseSchema = tokenPairResponseSchema
  .extend({ reactivated: z.boolean().optional() })
  .meta({ id: 'LoginResponse' });

export type LoginResponseInput = z.input<typeof loginResponseSchema>;
