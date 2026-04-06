import {
  UI_MESSAGE_STREAM_HEADERS,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
} from 'ai';
import type { FastifyInstance } from 'fastify';

import { createClientAbortHandle } from 'src/app/http/abort-on-disconnect.ts';
import { toApiErrorResponse } from 'src/shared/errors/api-error.mapper.ts';
import { logApiErrorResponse } from 'src/shared/logging/logger.ts';

import {
  AiDescriptionResponseSchema,
  AiPriceResponseSchema,
  AiStatusResponseSchema,
} from '../contracts/ai-response.contract.ts';
import { AiDescriptionRequestSchema, AiPriceRequestSchema } from '../contracts/ai-request.contract.ts';
import { streamChatResponse } from '../service/ai-chat.service.ts';
import { generateDescriptionSuggestion } from '../service/ai-description.service.ts';
import { generatePriceSuggestion } from '../service/ai-price.service.ts';
import { getAiStatusResponse } from '../service/ai-status.service.ts';
import type { OpenRouterClient } from '../providers/openrouter/openrouter.types.ts';
import { normalizeAiChatRequest } from './ai-chat-ui-stream.ts';

export const registerAiRoutes = (
  fastify: FastifyInstance,
  openRouterClient: OpenRouterClient,
): void => {
  fastify.get('/api/ai/status', () =>
    AiStatusResponseSchema.parse(getAiStatusResponse(openRouterClient)),
  );

  fastify.post('/api/ai/description', async (request, reply) => {
    const { item } = AiDescriptionRequestSchema.parse(request.body ?? {});

    const abortHandle = createClientAbortHandle(request, reply);
    try {
      return AiDescriptionResponseSchema.parse(
        await generateDescriptionSuggestion(openRouterClient, item, {
          signal: abortHandle.signal,
        }),
      );
    } finally {
      abortHandle.cleanup();
    }
  });

  fastify.post('/api/ai/price', async (request, reply) => {
    const { item } = AiPriceRequestSchema.parse(request.body ?? {});

    const abortHandle = createClientAbortHandle(request, reply);
    try {
      return AiPriceResponseSchema.parse(
        await generatePriceSuggestion(openRouterClient, item, {
          signal: abortHandle.signal,
        }),
      );
    } finally {
      abortHandle.cleanup();
    }
  });

  fastify.post('/api/ai/chat', async (request, reply) => {
    const { item, originalMessages, history, userMessage } =
      await normalizeAiChatRequest(request.body ?? {});

    openRouterClient.assertAvailable();
    const abortHandle = createClientAbortHandle(request, reply);

    reply.hijack();

    const stream = createUIMessageStream({
      originalMessages,
      onError: error => {
        const response = toApiErrorResponse(error);

        logApiErrorResponse(request, response, error);

        return response.body.message;
      },
      async execute({ writer }) {
        let textPartId: string | undefined;
        let textStarted = false;

        try {
          await streamChatResponse(openRouterClient, {
            item,
            messages: history,
            userMessage,
            signal: abortHandle.signal,
            onTextDelta: async delta => {
              if (!delta.length) {
                return;
              }

              textPartId ??= crypto.randomUUID();

              if (!textStarted) {
                writer.write({
                  type: 'text-start',
                  id: textPartId,
                });
                textStarted = true;
              }

              writer.write({
                type: 'text-delta',
                id: textPartId,
                delta,
              });
            },
          });

          if (textPartId) {
            writer.write({
              type: 'text-end',
              id: textPartId,
            });
          }
        } catch (error) {
          if (abortHandle.signal.aborted) {
            return;
          }

          throw error;
        } finally {
          abortHandle.cleanup();
        }
      },
    });

    pipeUIMessageStreamToResponse({
      response: reply.raw,
      stream,
      status: 200,
      headers: {
        ...UI_MESSAGE_STREAM_HEADERS,
        'cache-control': 'no-cache, no-transform',
      },
    });

    return reply;
  });
};
