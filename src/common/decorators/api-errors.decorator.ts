import { applyDecorators, type HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { errorResponseSchema } from '../schemas/error-response.schema.js';

export const ApiErrors = (...statuses: HttpStatus[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, standardSchema: errorResponseSchema }),
    ),
  );
