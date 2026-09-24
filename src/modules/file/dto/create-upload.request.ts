import { z } from 'zod';
import { FILE_NAME_MAX_LENGTH } from '../file.constants.js';

export const createUploadRequestSchema = z
  .object({
    purpose: z.string().min(1).max(100),
    contentType: z.string().min(1).max(255),
    size: z.number().int().positive(),
    fileName: z.string().min(1).max(FILE_NAME_MAX_LENGTH).optional(),
  })
  .strict()
  .meta({ id: 'CreateUploadRequest' });

export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;
