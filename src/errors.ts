import { FastifyError } from 'fastify';
import { treeifyError, ZodError } from 'zod';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'AI_UNAVAILABLE'
  | 'AI_PROVIDER_ERROR'
  | 'INTERNAL_ERROR';

export type ApiErrorResponse = {
  success: false;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validationError = (message: string, details?: unknown): AppError =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const notFoundError = (message: string, details?: unknown): AppError =>
  new AppError(404, 'NOT_FOUND', message, details);

export const aiUnavailableError = (
  message: string,
  details?: unknown,
): AppError => new AppError(503, 'AI_UNAVAILABLE', message, details);

export const toApiErrorResponse = (
  error: unknown,
): { statusCode: number; body: ApiErrorResponse } => {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: treeifyError(error),
      },
    };
  }

  const fastifyError = error as Partial<FastifyError> | undefined;

  if (fastifyError?.validation) {
    return {
      statusCode:
        typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 400,
      body: {
        success: false,
        code: 'VALIDATION_ERROR',
        message: fastifyError.message || 'Request validation failed.',
        details: fastifyError.validation,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
    },
  };
};
