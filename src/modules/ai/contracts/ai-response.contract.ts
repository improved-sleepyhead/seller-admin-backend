import { z } from 'zod';

import { INPUT_LIMITS } from 'src/shared/constants/input-limits.ts';

export const OpenRouterUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0).optional(),
    outputTokens: z.number().int().min(0).optional(),
    totalTokens: z.number().int().min(0).optional(),
  })
  .refine(
    usage =>
      usage.inputTokens !== undefined ||
      usage.outputTokens !== undefined ||
      usage.totalTokens !== undefined,
    {
      message: 'At least one usage counter must be present.',
    },
  );

export const AiStatusResponseSchema = z.strictObject({
  enabled: z.boolean(),
  provider: z.literal('openrouter').nullable(),
  model: z.string().nullable(),
  features: z.strictObject({
    description: z.boolean(),
    price: z.boolean(),
    chat: z.boolean(),
  }),
});

export const AiDescriptionResponseSchema = z.strictObject({
  suggestion: z.string().trim().min(1).max(INPUT_LIMITS.item.descriptionMaxLength),
  model: z.string().min(1).optional(),
  usage: OpenRouterUsageSchema.optional(),
});

export const AiPriceResponseSchema = z.strictObject({
  suggestedPrice: z.number().finite().min(0),
  reasoning: z.string().trim().min(1).max(INPUT_LIMITS.ai.priceReasoningMaxLength),
  currency: z.literal('RUB'),
  model: z.string().min(1).optional(),
  usage: OpenRouterUsageSchema.optional(),
});

export const AiChatResponseSchema = z.strictObject({
  message: z.strictObject({
    role: z.literal('assistant'),
    content: z.string().trim().min(1).max(INPUT_LIMITS.item.descriptionMaxLength),
  }),
  model: z.string().min(1).optional(),
  usage: OpenRouterUsageSchema.optional(),
});
