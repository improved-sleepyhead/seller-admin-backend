import { z } from 'zod';
import { buildDescriptionPromptMessages, AiPromptItem } from 'src/ai/ai-prompts.ts';
import {
  OpenRouterClient,
  OpenRouterUsage,
} from 'src/ai/openrouter-client.ts';
import { INPUT_LIMITS } from 'src/constants.ts';
import { aiProviderError } from 'src/errors.ts';

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
): Promise<AiDescriptionResponse> => {
  const completion = await openRouterClient.createTextCompletion({
    endpoint: 'description',
    messages: buildDescriptionPromptMessages(item),
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
