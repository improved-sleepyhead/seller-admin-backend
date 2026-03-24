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

export const aiProviderError = (
  message: string,
  details?: unknown,
  statusCode = 502,
): AppError => new AppError(statusCode, 'AI_PROVIDER_ERROR', message, details);
