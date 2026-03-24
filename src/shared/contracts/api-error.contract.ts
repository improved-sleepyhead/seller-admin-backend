import { z } from 'zod';

export const ApiErrorResponseSchema = z.strictObject({
  success: z.literal(false),
  code: z.enum([
    'VALIDATION_ERROR',
    'NOT_FOUND',
    'AI_UNAVAILABLE',
    'AI_PROVIDER_ERROR',
    'INTERNAL_ERROR',
  ]),
  message: z.string().min(1),
  details: z.unknown().optional(),
});
