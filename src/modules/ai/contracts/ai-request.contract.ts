import { z } from 'zod';

import { AiItemInputSchema } from 'src/modules/items/contracts/item-update.contract.ts';
import { INPUT_LIMITS } from 'src/shared/constants/input-limits.ts';

export const AiHistoryMessageSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  content: z
    .string()
    .trim()
    .min(1)
    .max(INPUT_LIMITS.ai.historyMessageMaxLength),
});

export const AiDescriptionRequestSchema = z.strictObject({
  item: AiItemInputSchema,
});

export const AiPriceRequestSchema = z.strictObject({
  item: AiItemInputSchema,
});

export const AiChatRequestSchema = z.strictObject({
  item: AiItemInputSchema,
  messages: z.array(AiHistoryMessageSchema).max(INPUT_LIMITS.ai.historyMaxItems),
  userMessage: z
    .string()
    .trim()
    .min(1)
    .max(INPUT_LIMITS.ai.userMessageMaxLength),
});

export type AiChatHistoryMessage = z.infer<typeof AiHistoryMessageSchema>;
