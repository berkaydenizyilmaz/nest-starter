import type { ValidationIssue } from './schemas/error-response.schema.js';

export const ErrorKind = {
  Validation: 'VALIDATION',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
} as const;

export type ErrorKind = (typeof ErrorKind)[keyof typeof ErrorKind];

export abstract class DomainError extends Error {
  abstract readonly kind: ErrorKind;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly kind = ErrorKind.Validation;

  constructor(
    code: string,
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(code, message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly kind = ErrorKind.Unauthorized;
}

export class ForbiddenError extends DomainError {
  readonly kind = ErrorKind.Forbidden;
}

export class NotFoundError extends DomainError {
  readonly kind = ErrorKind.NotFound;
}

export class ConflictError extends DomainError {
  readonly kind = ErrorKind.Conflict;
}
