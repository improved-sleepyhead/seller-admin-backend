import { z } from 'zod';

import { INPUT_LIMITS } from 'src/shared/constants/input-limits.ts';
import { aiProviderError } from 'src/shared/errors/app-error.ts';

import { tryParseJson } from '../mapper/ai-response.mapper.ts';
import {
  OpenRouterClient,
  OpenRouterUsage,
} from '../providers/openrouter/openrouter.types.ts';
import { buildPricePromptMessages } from '../prompts/price.prompt.ts';
import type { AiPromptItem } from '../prompts/item-context.prompt.ts';

const AI_PROVIDER_ERROR_MESSAGE =
  'Failed to receive a valid response from AI provider.';

const AiPriceResultSchema = z.strictObject({
  suggestedPrice: z.number().finite().min(0),
  reasoning: z.string().trim().min(1).max(INPUT_LIMITS.ai.priceReasoningMaxLength),
});

const AiPriceResponseFormatSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestedPrice', 'reasoning'],
  properties: {
    suggestedPrice: {
      type: 'number',
      minimum: 0,
    },
    reasoning: {
      type: 'string',
      minLength: 1,
      maxLength: INPUT_LIMITS.ai.priceReasoningMaxLength,
    },
  },
} satisfies Record<string, unknown>;

export type AiPriceResponse = {
  suggestedPrice: number;
  reasoning: string;
  currency: 'RUB';
  model?: string;
  usage?: OpenRouterUsage;
};

const normalizePriceValue = (value: string): number | undefined => {
  const numericValue = Number(value.replace(/[\s\u00A0]/g, '').replace(',', '.'));

  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : undefined;
};

const extractSuggestedPriceFromText = (value: string): number | undefined => {
  const matches = Array.from(
    value.matchAll(/(\d[\d\s\u00A0.,]*)\s*(?:₽|руб(?:\.|ля|лей)?|r(?:ou)?b)\b/giu),
  );

  if (matches.length !== 1) {
    return undefined;
  }

  return normalizePriceValue(matches[0][1] ?? '');
};

export const normalizePriceSuggestion = (
  value: string,
): Pick<AiPriceResponse, 'suggestedPrice' | 'reasoning'> => {
  const trimmedValue = value.trim();
  const parsedJson = tryParseJson(trimmedValue);
  const normalizedFromJson = AiPriceResultSchema.safeParse(parsedJson);

  if (normalizedFromJson.success) {
    return normalizedFromJson.data;
  }

  const suggestedPrice = extractSuggestedPriceFromText(trimmedValue);
  const normalizedReasoning = z
    .string()
    .trim()
    .min(1)
    .max(INPUT_LIMITS.ai.priceReasoningMaxLength)
    .safeParse(trimmedValue);

  if (suggestedPrice !== undefined && normalizedReasoning.success) {
    return {
      suggestedPrice,
      reasoning: normalizedReasoning.data,
    };
  }

  throw aiProviderError(AI_PROVIDER_ERROR_MESSAGE);
};

export const generatePriceSuggestion = async (
  openRouterClient: OpenRouterClient,
  item: AiPromptItem,
  options?: {
    signal?: AbortSignal;
  },
): Promise<AiPriceResponse> => {
  const completion = await openRouterClient.createTextCompletion({
    endpoint: 'price',
    messages: buildPricePromptMessages(item),
    signal: options?.signal,
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'ai_price_response',
        strict: true,
        schema: AiPriceResponseFormatSchema,
      },
    },
  });

  const normalizedSuggestion = normalizePriceSuggestion(completion.text);

  return {
    ...normalizedSuggestion,
    currency: 'RUB',
    model: completion.model,
    ...(completion.usage ? { usage: completion.usage } : {}),
  };
};
