import { aiProviderError } from 'src/shared/errors/app-error.ts';

import type {
  Logger,
  OpenRouterResponseChoicePayload,
  OpenRouterResponseErrorPayload,
  OpenRouterResponsePayload,
  OpenRouterUsage,
} from './openrouter.types.ts';

export const OPENROUTER_ERROR_MESSAGE =
  'Failed to receive a valid response from AI provider.';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const toOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length ? value : undefined;

export const normalizeUsage = (usage: unknown): OpenRouterUsage | undefined => {
  if (!isRecord(usage)) {
    return undefined;
  }

  const normalizedUsage = {
    inputTokens: toOptionalNumber(usage.prompt_tokens),
    outputTokens: toOptionalNumber(usage.completion_tokens),
    totalTokens: toOptionalNumber(usage.total_tokens),
    cost: toOptionalNumber(usage.cost),
  };

  return Object.values(normalizedUsage).some(value => value !== undefined)
    ? normalizedUsage
    : undefined;
};

const extractContentPartText = (part: unknown): string => {
  if (typeof part === 'string') {
    return part;
  }

  if (!isRecord(part) || typeof part.text !== 'string') {
    return '';
  }

  return part.text;
};

const extractTextContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content.map(extractContentPartText).join('').trim();
  }

  return '';
};

const extractStreamTextContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(extractContentPartText).join('');
  }

  return '';
};

export const getGenerationId = (payload: OpenRouterResponsePayload): string => {
  const generationId = toOptionalString(payload.id);

  if (!generationId) {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  return generationId;
};

const hasToolCalls = (message: unknown): boolean =>
  isRecord(message) &&
  Array.isArray(message.tool_calls) &&
  message.tool_calls.length > 0;

const hasChoiceError = (choice: OpenRouterResponseChoicePayload): boolean => {
  if (!isRecord(choice.error)) {
    return false;
  }

  const errorPayload = choice.error as OpenRouterResponseErrorPayload;

  return Boolean(
    toOptionalString(errorPayload.message) || toOptionalNumber(errorPayload.code),
  );
};

export const extractChoiceText = (payload: OpenRouterResponsePayload): string => {
  if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  const firstChoice = payload.choices[0];

  if (!isRecord(firstChoice)) {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  const choice = firstChoice as OpenRouterResponseChoicePayload;

  if (hasChoiceError(choice) || choice.finish_reason === 'error') {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  if (choice.finish_reason === 'tool_calls' || hasToolCalls(choice.message)) {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  if (isRecord(choice.message)) {
    const normalizedContent = extractTextContent(choice.message.content);

    if (normalizedContent.length) {
      return normalizedContent;
    }
  }

  const text = extractTextContent(choice.text);

  if (text.length) {
    return text;
  }

  throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
};

export const extractStreamChoiceText = (
  payload: OpenRouterResponsePayload,
): string => {
  if (!Array.isArray(payload.choices)) {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  if (payload.choices.length === 0) {
    return '';
  }

  const firstChoice = payload.choices[0];

  if (!isRecord(firstChoice)) {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  const choice = firstChoice as OpenRouterResponseChoicePayload & {
    delta?: unknown;
  };

  if (hasChoiceError(choice) || choice.finish_reason === 'error') {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  if (choice.finish_reason === 'tool_calls' || hasToolCalls(choice.delta)) {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }

  return isRecord(choice.delta) ? extractStreamTextContent(choice.delta.content) : '';
};

export const parseOpenRouterPayload = async (
  response: Response,
  allowInvalidBody = false,
): Promise<OpenRouterResponsePayload | undefined> => {
  try {
    const payload = (await response.json()) as unknown;

    if (!isRecord(payload)) {
      throw new Error('Provider response should be an object.');
    }

    return payload;
  } catch {
    if (allowInvalidBody) {
      return undefined;
    }

    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }
};

export const logRequestResult = (
  logger: Logger | undefined,
  level: 'info' | 'warn' | 'error',
  metadata: Record<string, unknown>,
  message: string,
): void => {
  logger?.[level](metadata, message);
};
