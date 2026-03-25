import type { FastifyInstance } from 'fastify';

import { createClientAbortHandle } from 'src/app/http/abort-on-disconnect.ts';
import {
  requestAcceptsEventStream,
  SSE_CONTENT_TYPE,
  writeSseEvent,
} from 'src/app/http/sse.ts';
import { toApiErrorResponse } from 'src/shared/errors/api-error.mapper.ts';
import { logApiErrorResponse } from 'src/shared/logging/logger.ts';

import { AiChatRequestSchema } from '../contracts/ai-request.contract.ts';
import {
  AiChatResponseSchema,
  AiDescriptionResponseSchema,
  AiPriceResponseSchema,
  AiStatusResponseSchema,
} from '../contracts/ai-response.contract.ts';
import { AiDescriptionRequestSchema, AiPriceRequestSchema } from '../contracts/ai-request.contract.ts';
import { generateChatResponse, streamChatResponse } from '../service/ai-chat.service.ts';
import { generateDescriptionSuggestion } from '../service/ai-description.service.ts';
import { generatePriceSuggestion } from '../service/ai-price.service.ts';
import { getAiStatusResponse } from '../service/ai-status.service.ts';
import type { OpenRouterClient } from '../providers/openrouter/openrouter.types.ts';

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
    const { item, messages, userMessage } = AiChatRequestSchema.parse(
      request.body ?? {},
    );

    if (!requestAcceptsEventStream(request.headers.accept)) {
      const abortHandle = createClientAbortHandle(request, reply);

      try {
        return AiChatResponseSchema.parse(
          await generateChatResponse(openRouterClient, {
            item,
            messages,
            userMessage,
            signal: abortHandle.signal,
          }),
        );
      } finally {
        abortHandle.cleanup();
      }
    }

    openRouterClient.assertAvailable();
    const abortHandle = createClientAbortHandle(request, reply);

    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader('Content-Type', SSE_CONTENT_TYPE);
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    try {
      await streamChatResponse(openRouterClient, {
        item,
        messages,
        userMessage,
        signal: abortHandle.signal,
        onEvent: event => writeSseEvent(reply, event.event, event.data),
      });
    } catch (error) {
      const response = toApiErrorResponse(error);

      logApiErrorResponse(request, response, error);
      writeSseEvent(reply, 'error', response.body);
    } finally {
      abortHandle.cleanup();

      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  });
};
