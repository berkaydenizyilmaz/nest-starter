import { z } from 'zod';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
} from '../constants/pagination.constants.js';

const limitField = z.coerce
  .number()
  .int()
  .min(1)
  .max(PAGINATION_MAX_LIMIT)
  .default(PAGINATION_DEFAULT_LIMIT);

export const offsetQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: limitField,
  })
  .strict();

export const cursorQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: limitField,
  })
  .strict();

export type OffsetQuery = z.infer<typeof offsetQuerySchema>;
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export const offsetPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({
      page: z.number().int(),
      limit: z.number().int(),
      total: z.number().int(),
      hasMore: z.boolean(),
    }),
  });

export const cursorPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    meta: z.object({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  });
