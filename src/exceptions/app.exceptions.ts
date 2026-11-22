// ============================================
// CUSTOM EXCEPTIONS - .NET: Custom Exception Classes
// ============================================
// Domain-specific exceptions for proper error handling

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, statusCode: number, code: string, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 Bad Request
export class BadRequestError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

// 401 Unauthorized
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', details?: any) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

// 403 Forbidden
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

// 404 Not Found
export class NotFoundError extends AppError {
  constructor(resource: string, details?: any) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
  }
}

// 409 Conflict
export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

// 422 Unprocessable Entity
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

// 500 Internal Server Error
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, 'INTERNAL_ERROR', details);
  }
}

// Domain-specific errors
export class PairingNotFoundError extends NotFoundError {
  constructor() {
    super('Pairing');
  }
}

export class PairingAlreadyExistsError extends ConflictError {
  constructor() {
    super('Already paired with this user');
  }
}

export class PairingPendingError extends ConflictError {
  constructor() {
    super('Pairing invitation already pending');
  }
}

export class PairingExpiredError extends BadRequestError {
  constructor() {
    super('Invitation expired');
  }
}

export class PairingBlockedError extends ForbiddenError {
  constructor() {
    super('Pairing blocked');
  }
}

export class SelfPairingError extends BadRequestError {
  constructor() {
    super('Cannot pair with yourself');
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('User');
  }
}

export class HealthDataNotFoundError extends NotFoundError {
  constructor() {
    super('Health data');
  }
}

export class DeviceNotFoundError extends NotFoundError {
  constructor() {
    super('Device');
  }
}

export class InvalidTokenError extends UnauthorizedError {
  constructor() {
    super('Invalid or expired token');
  }
}

export class SharingScopeError extends ForbiddenError {
  constructor(type: string) {
    super(`Data type '${type}' is not shared with you`);
  }
}

// Error code constants for client handling
export const ErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;