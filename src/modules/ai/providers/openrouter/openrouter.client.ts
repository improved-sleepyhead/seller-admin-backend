import { AppConfig } from 'src/shared/config/app-config.ts';
import { aiProviderError, aiUnavailableError } from 'src/shared/errors/app-error.ts';

import {
  buildRequestBody,
  buildRequestSignal,
  ensureNoTrailingSlash,
  OPENROUTER_CHAT_COMPLETIONS_PATH,
  toPublicAiEndpoint,
} from './openrouter.request.ts';
import {
  extractChoiceText,
  extractStreamChoiceText,
  getGenerationId,
  isRecord,
  logRequestResult,
  normalizeUsage,
  OPENROUTER_ERROR_MESSAGE,
  parseOpenRouterPayload,
  toOptionalString,
} from './openrouter.response.ts';
import { extractSseDataPayload, parseStreamingPayload } from './openrouter.stream.ts';
import type {
  Logger,
  OpenRouterClient,
  OpenRouterUsage,
} from './openrouter.types.ts';

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
      const { body: requestBody, requestedModel } = buildRequestBody(
        request,
        model,
        false,
      );

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
          endpoint: toPublicAiEndpoint(request.endpoint),
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
              endpoint: toPublicAiEndpoint(request.endpoint),
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
              endpoint: toPublicAiEndpoint(request.endpoint),
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
            endpoint: toPublicAiEndpoint(request.endpoint),
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
    async streamTextCompletion(request, handlers) {
      assertAvailable();

      const startedAt = Date.now();
      const { signal, cleanup } = buildRequestSignal(aiConfig.timeoutMs, request.signal);
      const { body: requestBody, requestedModel } = buildRequestBody(
        request,
        model,
        true,
      );

      let generationId: string | undefined;
      let responseModel: string | undefined;
      let usage: OpenRouterUsage | undefined;
      let responseStarted = false;
      let receivedDone = false;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      const emitResponseStart = async () => {
        if (!generationId || responseStarted) {
          return;
        }

        responseStarted = true;
        await handlers.onResponseStart?.({
          id: generationId,
          model: responseModel ?? requestedModel ?? model,
        });
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

        const logMetadata = {
          endpoint: toPublicAiEndpoint(request.endpoint),
          model: requestedModel ?? model,
          durationMs: Date.now() - startedAt,
          provider: 'openrouter',
          status: response.status,
        };

        if (!response.ok) {
          await parseOpenRouterPayload(response, true);

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

        if (!response.body) {
          throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
        }

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processFrame = async (frame: string) => {
          const data = extractSseDataPayload(frame);

          if (!data) {
            return;
          }

          if (data === '[DONE]') {
            receivedDone = true;
            return;
          }

          const chunkPayload = parseStreamingPayload(data);
          generationId ??= toOptionalString(chunkPayload.id);
          responseModel ??= toOptionalString(chunkPayload.model);
          usage = normalizeUsage(chunkPayload.usage) ?? usage;
          await emitResponseStart();

          const delta = extractStreamChoiceText(chunkPayload);

          if (delta.length) {
            await handlers.onTextDelta(delta);
          }
        };

        while (!receivedDone) {
          const { done, value } = await reader.read();

          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          buffer = buffer.replace(/\r\n/g, '\n');

          let separatorIndex = buffer.indexOf('\n\n');

          while (separatorIndex !== -1) {
            const frame = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);

            await processFrame(frame);

            if (receivedDone) {
              break;
            }

            separatorIndex = buffer.indexOf('\n\n');
          }

          if (done) {
            break;
          }
        }

        if (!receivedDone && buffer.trim().length) {
          await processFrame(buffer);
        }

        if (!receivedDone || !generationId) {
          throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
        }

        const finalModel = responseModel ?? requestedModel ?? model;

        logRequestResult(
          logger,
          'info',
          {
            endpoint: toPublicAiEndpoint(request.endpoint),
            model: finalModel,
            durationMs: Date.now() - startedAt,
            provider: 'openrouter',
            status: response.status,
            generationId,
            ...(usage ? { usage } : {}),
          },
          'OpenRouter streaming request completed.',
        );

        return {
          id: generationId,
          model: finalModel,
          ...(usage ? { usage } : {}),
        };
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          logRequestResult(
            logger,
            'warn',
            {
              endpoint: toPublicAiEndpoint(request.endpoint),
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
              endpoint: toPublicAiEndpoint(request.endpoint),
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
            endpoint: toPublicAiEndpoint(request.endpoint),
            model: requestedModel ?? model,
            durationMs: Date.now() - startedAt,
            provider: 'openrouter',
            status: 502,
          },
          'OpenRouter request failed before a valid response was received.',
        );

        throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
      } finally {
        await reader?.cancel().catch(() => undefined);
        cleanup();
      }
    },
  };
};
