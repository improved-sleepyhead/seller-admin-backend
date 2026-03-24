import { z } from 'zod';
import {
  AiChatHistoryMessage,
  AiPromptItem,
  buildChatPromptMessages,
} from 'src/ai/ai-prompts.ts';
import {
  OpenRouterClient,
  OpenRouterUsage,
} from 'src/ai/openrouter-client.ts';
import { INPUT_LIMITS } from 'src/constants.ts';
import { aiProviderError } from 'src/errors.ts';

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

const stripCodeFence = (value: string): string => {
  const trimmed = value.trim();
  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return codeFenceMatch?.[1]?.trim() ?? trimmed;
};

const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(stripCodeFence(value));
  } catch {
    return undefined;
  }
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
  }: {
    item: AiPromptItem;
    messages: AiChatHistoryMessage[];
    userMessage: string;
  },
): Promise<AiChatResponse> => {
  const completion = await openRouterClient.createTextCompletion({
    endpoint: 'chat',
    messages: buildChatPromptMessages({
      item,
      messages,
      userMessage,
    }),
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
