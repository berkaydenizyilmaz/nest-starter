import { z } from 'zod';

export const validationIssueSchema = z
  .object({
    field: z.string().nullable(),
    code: z.string(),
    message: z.string(),
  })
  .meta({ id: 'ValidationIssue' });

export const errorResponseSchema = z
  .object({
    statusCode: z.number().int(),
    code: z.string(),
    message: z.string(),
    timestamp: z.string(),
    path: z.string(),
    requestId: z.string().optional(),
    errors: z.array(validationIssueSchema).optional(),
  })
  .meta({ id: 'ErrorResponse' });

export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
