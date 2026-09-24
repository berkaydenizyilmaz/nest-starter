import { z } from 'zod';
import { isoDate } from '../../../common/schemas/iso-date.schema.js';

export const uploadTicketResponseSchema = z
  .object({
    fileId: z.uuid(),
    uploadUrl: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: isoDate(),
  })
  .meta({ id: 'UploadTicket' });

export type UploadTicketResponseInput = z.input<
  typeof uploadTicketResponseSchema
>;
