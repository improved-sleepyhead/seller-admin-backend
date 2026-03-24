import { FastifyError } from 'fastify';
import { treeifyError, ZodError } from 'zod';

import { ApiErrorResponse, AppError } from './app-error.ts';

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
