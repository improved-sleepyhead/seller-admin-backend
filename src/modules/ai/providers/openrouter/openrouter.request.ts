import type {
  OpenRouterTextCompletionRequest,
  RequestSignalHandle,
} from './openrouter.types.ts';

export const OPENROUTER_CHAT_COMPLETIONS_PATH = '/chat/completions';

export const toPublicAiEndpoint = (
  endpoint: OpenRouterTextCompletionRequest['endpoint'],
): string => `/api/ai/${endpoint}`;

export const ensureNoTrailingSlash = (value: string): string =>
  value.replace(/\/+$/, '');

const createAbortReason = (
  name: 'AbortError' | 'TimeoutError',
  message: string,
): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

export const buildRequestSignal = (
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

export const buildRequestBody = (
  request: OpenRouterTextCompletionRequest,
  defaultModel: string,
  stream: boolean,
) => {
  const requestedModel =
    typeof request.model === 'string' && request.model.trim().length
      ? request.model
      : undefined;

  return {
    body: {
      ...(requestedModel || !request.models?.length
        ? { model: requestedModel ?? defaultModel }
        : {}),
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
      stream,
    },
    requestedModel,
  };
};
