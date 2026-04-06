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

export const AiChatMessagePartSchema = z
  .object({
    type: z.string().trim().min(1),
  })
  .passthrough();

export const AiChatUiMessageSchema = z
  .object({
    id: z.string().trim().min(1),
    role: z.enum(['system', 'user', 'assistant']),
    metadata: z.unknown().optional(),
    parts: z.array(AiChatMessagePartSchema),
  })
  .passthrough();

export const AiChatRequestSchema = z
  .object({
    item: AiItemInputSchema,
    messages: z.array(AiChatUiMessageSchema).max(INPUT_LIMITS.ai.historyMaxItems),
    id: z.string().trim().min(1).optional(),
    messageId: z.string().trim().min(1).optional(),
    trigger: z.string().trim().min(1).optional(),
  })
  .passthrough();

export const AiLegacyChatRequestSchema = z.strictObject({
  item: AiItemInputSchema,
  messages: z.array(AiHistoryMessageSchema).max(INPUT_LIMITS.ai.historyMaxItems),
  userMessage: z
    .string()
    .trim()
    .min(1)
    .max(INPUT_LIMITS.ai.userMessageMaxLength),
});

export type AiChatHistoryMessage = z.infer<typeof AiHistoryMessageSchema>;
export type AiChatUiMessage = z.infer<typeof AiChatUiMessageSchema>;
