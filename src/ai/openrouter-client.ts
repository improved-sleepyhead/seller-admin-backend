import { AppConfig } from 'src/config.ts';
import { aiProviderError, aiUnavailableError } from 'src/errors.ts';

type Logger = {
  info: (object: Record<string, unknown>, message?: string) => void;
  warn: (object: Record<string, unknown>, message?: string) => void;
  error: (object: Record<string, unknown>, message?: string) => void;
};

type OpenRouterTextContentPart = {
  type: 'text';
  text: string;
};

type OpenRouterImageContentPart = {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: string;
  };
};

type OpenRouterContentPart = OpenRouterTextContentPart | OpenRouterImageContentPart;

export type OpenRouterMessage =
  | {
      role: 'system' | 'user' | 'assistant';
      content: string | OpenRouterContentPart[];
      name?: string;
    }
  | {
      role: 'tool';
      content: string;
      tool_call_id: string;
      name?: string;
    };

type OpenRouterResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      };
    };

type OpenRouterFunctionParameters = Record<string, unknown>;

type OpenRouterTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: OpenRouterFunctionParameters;
    strict?: boolean;
  };
};

type OpenRouterToolChoice =
  | 'none'
  | 'auto'
  | {
      type: 'function';
      function: {
        name: string;
      };
    };

type OpenRouterPlugin = {
  id: string;
  enabled?: boolean;
  [key: string]: unknown;
};

type OpenRouterProviderSort =
  | 'price'
  | 'throughput'
  | 'latency'
  | {
      by: 'price' | 'throughput' | 'latency';
      partition?: 'model' | 'none';
    };

type OpenRouterProviderMetricPreference =
  | number
  | {
      p50?: number;
      p75?: number;
      p90?: number;
      p99?: number;
    };

export type OpenRouterProviderPreferences = {
  order?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: 'allow' | 'deny';
  zdr?: boolean;
  enforce_distillable_text?: boolean;
  only?: string[];
  ignore?: string[];
  quantizations?: string[];
  sort?: OpenRouterProviderSort;
  preferred_min_throughput?: OpenRouterProviderMetricPreference;
  preferred_max_latency?: OpenRouterProviderMetricPreference;
  max_price?: Record<string, number>;
  [key: string]: unknown;
};

type OpenRouterTextCompletionRequest = {
  endpoint: 'description' | 'price' | 'chat';
  messages: OpenRouterMessage[];
  signal?: AbortSignal;
  headers?: Record<string, string>;
  model?: string;
  models?: string[];
  route?: 'fallback';
  user?: string;
  provider?: OpenRouterProviderPreferences;
  plugins?: OpenRouterPlugin[];
  responseFormat?: OpenRouterResponseFormat;
  tools?: OpenRouterTool[];
  toolChoice?: OpenRouterToolChoice;
  maxTokens?: number;
  temperature?: number;
  stop?: string | string[];
};

export type OpenRouterUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
};

export type OpenRouterTextCompletionResult = {
  id: string;
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

type OpenRouterResponseErrorPayload = {
  code?: unknown;
  message?: unknown;
};

type OpenRouterResponseChoicePayload = {
  finish_reason?: unknown;
  message?: unknown;
  text?: unknown;
  error?: unknown;
};

type OpenRouterResponsePayload = {
  id?: unknown;
  model?: unknown;
  usage?: unknown;
  choices?: unknown;
};

type RequestSignalHandle = {
  signal: AbortSignal;
  cleanup: () => void;
};

const OPENROUTER_CHAT_COMPLETIONS_PATH = '/chat/completions';
const OPENROUTER_ERROR_MESSAGE = 'Failed to receive a valid response from AI provider.';

const ensureNoTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const createAbortReason = (name: 'AbortError' | 'TimeoutError', message: string): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

const buildRequestSignal = (
  timeoutMs: number,
  callerSignal?: AbortSignal,
): RequestSignalHandle => {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(
      createAbortReason('TimeoutError', 'The OpenRouter request timed out.'),
    );
  }, timeoutMs);

  const cleanupHandlers: Array<() => void> = [() => clearTimeout(timeoutId)];

  if (!callerSignal) {
    return {
      signal: timeoutController.signal,
      cleanup: () => {
        cleanupHandlers.forEach(cleanup => cleanup());
      },
    };
  }

  if (typeof AbortSignal.any === 'function') {
    return {
      signal: AbortSignal.any([timeoutController.signal, callerSignal]),
      cleanup: () => {
        cleanupHandlers.forEach(cleanup => cleanup());
      },
    };
  }

  const combinedController = new AbortController();

  const abortCombinedSignal = (signal: AbortSignal, fallbackReason: Error) => {
    if (combinedController.signal.aborted) {
      return;
    }

    combinedController.abort(signal.reason ?? fallbackReason);
  };

  const handleTimeoutAbort = () => {
    abortCombinedSignal(
      timeoutController.signal,
      createAbortReason('TimeoutError', 'The OpenRouter request timed out.'),
    );
  };

  const handleCallerAbort = () => {
    abortCombinedSignal(
      callerSignal,
      createAbortReason('AbortError', 'The OpenRouter request was aborted.'),
    );
  };

  if (timeoutController.signal.aborted) {
    handleTimeoutAbort();
  } else {
    timeoutController.signal.addEventListener('abort', handleTimeoutAbort, {
      once: true,
    });
    cleanupHandlers.push(() =>
      timeoutController.signal.removeEventListener('abort', handleTimeoutAbort),
    );
  }

  if (callerSignal.aborted) {
    handleCallerAbort();
  } else {
    callerSignal.addEventListener('abort', handleCallerAbort, { once: true });
    cleanupHandlers.push(() =>
      callerSignal.removeEventListener('abort', handleCallerAbort),
    );
  }

  return {
    signal: combinedController.signal,
    cleanup: () => {
      cleanupHandlers.forEach(cleanup => cleanup());
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length ? value : undefined;

const normalizeUsage = (usage: unknown): OpenRouterUsage | undefined => {
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

const getGenerationId = (payload: OpenRouterResponsePayload): string => {
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

const extractChoiceText = (payload: OpenRouterResponsePayload): string => {
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

const parseOpenRouterPayload = async (
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
      const { signal, cleanup } = buildRequestSignal(aiConfig.timeoutMs, request.signal);
      const requestedModel =
        typeof request.model === 'string' && request.model.trim().length
          ? request.model
          : undefined;

      const requestBody = {
        ...(requestedModel || !request.models?.length ? { model: requestedModel ?? model } : {}),
        ...(request.models?.length ? { models: request.models } : {}),
        ...(request.route ? { route: request.route } : {}),
        ...(request.user ? { user: request.user } : {}),
        ...(request.provider ? { provider: request.provider } : {}),
        ...(request.plugins?.length ? { plugins: request.plugins } : {}),
        ...(request.responseFormat
          ? { response_format: request.responseFormat }
          : {}),
        ...(request.tools?.length ? { tools: request.tools } : {}),
        ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
        ...(typeof request.maxTokens === 'number'
          ? { max_tokens: request.maxTokens }
          : {}),
        ...(typeof request.temperature === 'number'
          ? { temperature: request.temperature }
          : {}),
        ...(request.stop ? { stop: request.stop } : {}),
        messages: request.messages,
        stream: false,
      };

      try {
        const response = await fetch(`${baseUrl}${OPENROUTER_CHAT_COMPLETIONS_PATH}`, {
          method: 'POST',
          headers: {
            ...(request.headers ?? {}),
            Authorization: `Bearer ${aiConfig.openrouter.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal,
        });

        const payload = await parseOpenRouterPayload(response, !response.ok);
        const usage = normalizeUsage(payload?.usage);
        const generationId =
          payload && isRecord(payload) ? toOptionalString(payload.id) : undefined;
        const logMetadata = {
          endpoint: request.endpoint,
          model: requestedModel ?? model,
          durationMs: Date.now() - startedAt,
          provider: 'openrouter',
          status: response.status,
          ...(generationId ? { generationId } : {}),
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
            OPENROUTER_ERROR_MESSAGE,
            undefined,
            response.status === 408 ? 504 : 502,
          );
        }

        if (!payload) {
          throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
        }

        const text = extractChoiceText(payload);
        const responseModel = toOptionalString(payload.model) ?? requestedModel ?? model;

        logRequestResult(
          logger,
          'info',
          {
            ...logMetadata,
            model: responseModel,
          },
          'OpenRouter request completed.',
        );

        return {
          id: getGenerationId(payload),
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
              model: requestedModel ?? model,
              durationMs: Date.now() - startedAt,
              provider: 'openrouter',
              status: 504,
            },
            'OpenRouter request timed out.',
          );

          throw aiProviderError(OPENROUTER_ERROR_MESSAGE, undefined, 504);
        }

        if (error instanceof Error && error.name === 'AbortError') {
          logRequestResult(
            logger,
            'warn',
            {
              endpoint: request.endpoint,
              model: requestedModel ?? model,
              durationMs: Date.now() - startedAt,
              provider: 'openrouter',
              status: 502,
            },
            'OpenRouter request was aborted.',
          );

          throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
        }

        if (error instanceof Error && 'code' in error) {
          throw error;
        }

        logRequestResult(
          logger,
          'error',
          {
            endpoint: request.endpoint,
            model: requestedModel ?? model,
            durationMs: Date.now() - startedAt,
            provider: 'openrouter',
            status: 502,
          },
          'OpenRouter request failed before a valid response was received.',
        );

        throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
      } finally {
        cleanup();
      }
    },
  };
};
