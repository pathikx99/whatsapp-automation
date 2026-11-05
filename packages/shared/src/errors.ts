export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DatabaseSafetyError extends AppError {
  constructor(message: string, details?: unknown) {
    super(
      `DATABASE SAFETY VIOLATION: ${message}. Operation blocked to protect remote or production data.`,
      403,
      details,
    );
    this.name = 'DatabaseSafetyError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    super(
      identifier
        ? `${resource} with ID '${identifier}' was not found`
        : `${resource} was not found`,
      404,
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, reason?: string) {
    super(`${service} is temporarily unavailable${reason ? `: ${reason}` : ''}`, 503);
    this.name = 'ServiceUnavailableError';
  }
}
