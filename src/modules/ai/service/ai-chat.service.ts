import { z } from 'zod';

import type { AiChatHistoryMessage } from 'src/modules/ai/contracts/ai-request.contract.ts';
import {
  OpenRouterClient,
  OpenRouterTextCompletionStreamResult,
  OpenRouterUsage,
} from 'src/modules/ai/providers/openrouter/openrouter.types.ts';
import { INPUT_LIMITS } from 'src/shared/constants/input-limits.ts';
import { aiProviderError } from 'src/shared/errors/app-error.ts';

import { tryParseJson } from '../mapper/ai-response.mapper.ts';
import { buildChatPromptMessages } from '../prompts/chat.prompt.ts';
import type { AiPromptItem } from '../prompts/item-context.prompt.ts';

const AI_PROVIDER_ERROR_MESSAGE =
  'Failed to receive a valid response from AI provider.';

const AiChatMessageSchema = z.strictObject({
  role: z.literal('assistant'),
  content: z.string().trim().min(1).max(INPUT_LIMITS.item.descriptionMaxLength),
});

const AiChatResultSchema = z.strictObject({
  message: AiChatMessageSchema,
});

const AiChatResponseFormatSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message'],
  properties: {
    message: {
      type: 'object',
      additionalProperties: false,
      required: ['role', 'content'],
      properties: {
        role: {
          type: 'string',
          const: 'assistant',
        },
        content: {
          type: 'string',
          minLength: 1,
          maxLength: INPUT_LIMITS.item.descriptionMaxLength,
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export type AiChatResponse = {
  message: {
    role: 'assistant';
    content: string;
  };
  model?: string;
  usage?: OpenRouterUsage;
};

export const normalizeChatMessage = (
  value: string,
): AiChatResponse['message'] => {
  const trimmedValue = value.trim();
  const parsedJson = tryParseJson(trimmedValue);
  const normalizedFromJson = AiChatResultSchema.safeParse(parsedJson);

  if (normalizedFromJson.success) {
    return normalizedFromJson.data.message;
  }

  const normalizedPlainText = z
    .string()
    .trim()
    .min(1)
    .max(INPUT_LIMITS.item.descriptionMaxLength)
    .safeParse(trimmedValue);

  if (normalizedPlainText.success) {
    return {
      role: 'assistant',
      content: normalizedPlainText.data,
    };
  }

  throw aiProviderError(AI_PROVIDER_ERROR_MESSAGE);
};

export const generateChatResponse = async (
  openRouterClient: OpenRouterClient,
  {
    item,
    messages,
    userMessage,
    signal,
  }: {
    item: AiPromptItem;
    messages: AiChatHistoryMessage[];
    userMessage: string;
    signal?: AbortSignal;
  },
): Promise<AiChatResponse> => {
  const completion = await openRouterClient.createTextCompletion({
    endpoint: 'chat',
    messages: buildChatPromptMessages({
      item,
      messages,
      userMessage,
    }),
    signal,
    maxTokens: INPUT_LIMITS.ai.completionMaxTokens.chat,
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'ai_chat_response',
        strict: true,
        schema: AiChatResponseFormatSchema,
      },
    },
  });

  const message = normalizeChatMessage(completion.text);

  return {
    message,
    model: completion.model,
    ...(completion.usage ? { usage: completion.usage } : {}),
  };
};

export const streamChatResponse = async (
  openRouterClient: OpenRouterClient,
  {
    item,
    messages,
    userMessage,
    onResponseStart,
    onTextDelta,
    signal,
  }: {
    item: AiPromptItem;
    messages: AiChatHistoryMessage[];
    userMessage: string;
    onResponseStart?: (
      metadata: {
        id: string;
        model: string;
      },
    ) => void | Promise<void>;
    onTextDelta: (delta: string) => void | Promise<void>;
    signal?: AbortSignal;
  },
): Promise<OpenRouterTextCompletionStreamResult> => {
  let totalContentLength = 0;

  const completion = await openRouterClient.streamTextCompletion(
    {
      endpoint: 'chat',
      messages: buildChatPromptMessages({
        item,
        messages,
        userMessage,
      }),
      signal,
      maxTokens: INPUT_LIMITS.ai.completionMaxTokens.chat,
    },
    {
      onResponseStart,
      onTextDelta: async delta => {
        totalContentLength += delta.length;

        if (totalContentLength > INPUT_LIMITS.item.descriptionMaxLength) {
          throw aiProviderError(AI_PROVIDER_ERROR_MESSAGE);
        }

        await onTextDelta(delta);
      },
    },
  );

  if (totalContentLength < 1) {
    throw aiProviderError(AI_PROVIDER_ERROR_MESSAGE);
  }

  return completion;
};
