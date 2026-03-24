import { z } from 'zod';

import { ApiErrorResponseSchema } from 'src/shared/contracts/api-error.contract.ts';

import { OpenRouterUsageSchema } from './ai-response.contract.ts';

export const AiChatStreamEventSchema = z.discriminatedUnion('event', [
  z.strictObject({
    event: z.literal('meta'),
    data: z.strictObject({
      model: z.string().min(1),
    }),
  }),
  z.strictObject({
    event: z.literal('chunk'),
    data: z.strictObject({
      content: z.string().min(1),
    }),
  }),
  z.strictObject({
    event: z.literal('done'),
    data: z
      .strictObject({
        model: z.string().min(1).optional(),
        usage: OpenRouterUsageSchema.optional(),
      })
      .refine(event => event.model !== undefined || event.usage !== undefined, {
        message: 'Done event should include model or usage.',
      }),
  }),
  z.strictObject({
    event: z.literal('error'),
    data: ApiErrorResponseSchema,
  }),
]);

export type AiChatStreamEvent = z.infer<typeof AiChatStreamEventSchema>;
