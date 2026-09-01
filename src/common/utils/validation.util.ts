import { ValidationError } from '../domain.error.js';
import { COMMON_ERROR } from '../constants/error-codes.constants.js';
import type { ValidationIssue } from '../schemas/error-response.schema.js';

interface StandardSchemaIssue {
  message: string;
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
  code?: unknown;
}

export function toValidationError(
  issues: readonly StandardSchemaIssue[],
): ValidationError {
  const details = issues.map(toIssue);

  return new ValidationError(
    COMMON_ERROR.VALIDATION_FAILED,
    'Request validation failed',
    details,
  );
}

function toIssue(issue: StandardSchemaIssue): ValidationIssue {
  const path = (issue.path ?? [])
    .map((segment) =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String(segment.key)
        : String(segment),
    )
    .join('.');

  return {
    field: path.length > 0 ? path : null,
    code: typeof issue.code === 'string' ? issue.code : 'invalid',
    message: issue.message,
  };
}
