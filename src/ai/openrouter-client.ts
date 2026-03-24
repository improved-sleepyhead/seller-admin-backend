import { AppConfig } from 'src/config.ts';
import { aiProviderError, aiUnavailableError } from 'src/errors.ts';

type Logger = {
  info: (object: Record<string, unknown>, message?: string) => void;
  warn: (object: Record<string, unknown>, message?: string) => void;
  error: (object: Record<string, unknown>, message?: string) => void;
};

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenRouterResponseFormat = Record<string, unknown>;

type OpenRouterTextCompletionRequest = {
  endpoint: 'description' | 'price' | 'chat';
  messages: OpenRouterMessage[];
  signal?: AbortSignal;
  responseFormat?: OpenRouterResponseFormat;
};

export type OpenRouterUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type OpenRouterTextCompletionResult = {
  model: string;
  text: string;
  usage?: OpenRouterUsage;
};

export type OpenRouterClient = {
  readonly enabled: boolean;
  readonly provider: 'openrouter';
  readonly model: string;
  readonly baseUrl: string;
  assertAvailable: () => void;
  createTextCompletion: (
    request: OpenRouterTextCompletionRequest,
  ) => Promise<OpenRouterTextCompletionResult>;
};

type OpenRouterResponsePayload = {
  model?: unknown;
  usage?: unknown;
  choices?: unknown;
};

const OPENROUTER_CHAT_COMPLETIONS_PATH = '/chat/completions';

const ensureNoTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const buildRequestSignal = (
  timeoutMs: number,
  callerSignal?: AbortSignal,
): AbortSignal => {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  if (!callerSignal) {
    return timeoutSignal;
  }

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([timeoutSignal, callerSignal]);
  }

  return callerSignal.aborted ? callerSignal : timeoutSignal;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizeUsage = (usage: unknown): OpenRouterUsage | undefined => {
  if (!isRecord(usage)) {
    return undefined;
  }

  const normalizedUsage = {
    inputTokens: toOptionalNumber(usage.prompt_tokens),
    outputTokens: toOptionalNumber(usage.completion_tokens),
    totalTokens: toOptionalNumber(usage.total_tokens),
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

const extractChoiceText = (payload: OpenRouterResponsePayload): string => {
  if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw aiProviderError('Failed to receive a valid response from AI provider.');
  }

  const firstChoice = payload.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw aiProviderError('Failed to receive a valid response from AI provider.');
  }

  const content = firstChoice.message.content;

  if (typeof content === 'string') {
    const normalizedContent = content.trim();

    if (normalizedContent.length) {
      return normalizedContent;
    }
  }

  if (Array.isArray(content)) {
    const normalizedContent = content
      .map(extractContentPartText)
      .join('')
      .trim();

    if (normalizedContent.length) {
      return normalizedContent;
    }
  }

  throw aiProviderError('Failed to receive a valid response from AI provider.');
};

const parseOpenRouterPayload = async (
  response: Response,
): Promise<OpenRouterResponsePayload> => {
  try {
    const payload = (await response.json()) as unknown;

    if (!isRecord(payload)) {
      throw new Error('Provider response should be an object.');
    }

    return payload;
  } catch {
    throw aiProviderError('Failed to receive a valid response from AI provider.');
  }
};

const logRequestResult = (
  logger: Logger | undefined,
  level: 'info' | 'warn' | 'error',
  metadata: Record<string, unknown>,
  message: string,
): void => {
  logger?.[level](metadata, message);
};

export const createOpenRouterClient = (
  aiConfig: AppConfig['ai'],
  logger?: Logger,
): OpenRouterClient => {
  const baseUrl = ensureNoTrailingSlash(aiConfig.openrouter.baseUrl);
  const model = aiConfig.openrouter.model;

  const assertAvailable = () => {
    if (!aiConfig.enabled || !aiConfig.openrouter.apiKey) {
      throw aiUnavailableError('AI features are currently unavailable.');
    }
  };

  return {
    enabled: aiConfig.enabled,
    provider: 'openrouter',
    model,
    baseUrl,
    assertAvailable,
    async createTextCompletion(request) {
      assertAvailable();

      const startedAt = Date.now();
      const signal = buildRequestSignal(aiConfig.timeoutMs, request.signal);

      try {
        const response = await fetch(`${baseUrl}${OPENROUTER_CHAT_COMPLETIONS_PATH}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${aiConfig.openrouter.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: request.messages,
            stream: false,
            ...(request.responseFormat
              ? { response_format: request.responseFormat }
              : {}),
          }),
          signal,
        });

        const payload = await parseOpenRouterPayload(response);
        const usage = normalizeUsage(payload.usage);
        const logMetadata = {
          endpoint: request.endpoint,
          model,
          durationMs: Date.now() - startedAt,
          provider: 'openrouter',
          status: response.status,
          ...(usage ? { usage } : {}),
        };

        if (!response.ok) {
          logRequestResult(
            logger,
            'warn',
            logMetadata,
            'OpenRouter request returned an upstream error.',
          );

          throw aiProviderError(
            'Failed to receive a valid response from AI provider.',
            undefined,
            response.status === 408 ? 504 : 502,
          );
        }

        const text = extractChoiceText(payload);
        const responseModel =
          typeof payload.model === 'string' && payload.model.trim().length
            ? payload.model
            : model;

        logRequestResult(
          logger,
          'info',
          logMetadata,
          'OpenRouter request completed.',
        );

        return {
          model: responseModel,
          text,
          ...(usage ? { usage } : {}),
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          logRequestResult(
            logger,
            'warn',
            {
              endpoint: request.endpoint,
              model,
              durationMs: Date.now() - startedAt,
              provider: 'openrouter',
              status: 504,
            },
            'OpenRouter request timed out.',
          );

          throw aiProviderError(
            'Failed to receive a valid response from AI provider.',
            undefined,
            504,
          );
        }

        if (error instanceof Error && error.name === 'AbortError') {
          logRequestResult(
            logger,
            'warn',
            {
              endpoint: request.endpoint,
              model,
              durationMs: Date.now() - startedAt,
              provider: 'openrouter',
              status: 502,
            },
            'OpenRouter request was aborted.',
          );

          throw aiProviderError('Failed to receive a valid response from AI provider.');
        }

        if (error instanceof Error && 'code' in error) {
          throw error;
        }

        logRequestResult(
          logger,
          'error',
          {
            endpoint: request.endpoint,
            model,
            durationMs: Date.now() - startedAt,
            provider: 'openrouter',
            status: 502,
          },
          'OpenRouter request failed before a valid response was received.',
        );

        throw aiProviderError('Failed to receive a valid response from AI provider.');
      }
    },
  };
};
