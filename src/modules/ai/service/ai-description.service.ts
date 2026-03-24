import { z } from 'zod';

import { INPUT_LIMITS } from 'src/shared/constants/input-limits.ts';
import { aiProviderError } from 'src/shared/errors/app-error.ts';

import { tryParseJson } from '../mapper/ai-response.mapper.ts';
import {
  OpenRouterClient,
  OpenRouterUsage,
} from '../providers/openrouter/openrouter.types.ts';
import { buildDescriptionPromptMessages } from '../prompts/description.prompt.ts';
import type { AiPromptItem } from '../prompts/item-context.prompt.ts';

const AI_PROVIDER_ERROR_MESSAGE =
  'Failed to receive a valid response from AI provider.';

const AiDescriptionResultSchema = z.strictObject({
  suggestion: z.string().trim().min(1).max(INPUT_LIMITS.item.descriptionMaxLength),
});

const AiDescriptionResponseFormatSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestion'],
  properties: {
    suggestion: {
      type: 'string',
      minLength: 1,
      maxLength: INPUT_LIMITS.item.descriptionMaxLength,
    },
  },
} satisfies Record<string, unknown>;

export type AiDescriptionResponse = {
  suggestion: string;
  model?: string;
  usage?: OpenRouterUsage;
};

export const normalizeDescriptionSuggestion = (value: string): string => {
  const trimmedValue = value.trim();
  const parsedJson = tryParseJson(trimmedValue);
  const normalizedFromJson = AiDescriptionResultSchema.safeParse(parsedJson);

  if (normalizedFromJson.success) {
    return normalizedFromJson.data.suggestion;
  }

  const normalizedPlainText = z
    .string()
    .trim()
    .min(1)
    .max(INPUT_LIMITS.item.descriptionMaxLength)
    .safeParse(trimmedValue);

  if (normalizedPlainText.success) {
    return normalizedPlainText.data;
  }

  throw aiProviderError(AI_PROVIDER_ERROR_MESSAGE);
};

export const generateDescriptionSuggestion = async (
  openRouterClient: OpenRouterClient,
  item: AiPromptItem,
  options?: {
    signal?: AbortSignal;
  },
): Promise<AiDescriptionResponse> => {
  const completion = await openRouterClient.createTextCompletion({
    endpoint: 'description',
    messages: buildDescriptionPromptMessages(item),
    signal: options?.signal,
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'ai_description_response',
        strict: true,
        schema: AiDescriptionResponseFormatSchema,
      },
    },
  });

  const suggestion = normalizeDescriptionSuggestion(completion.text);

  return {
    suggestion,
    model: completion.model,
    ...(completion.usage ? { usage: completion.usage } : {}),
  };
};
