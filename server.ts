import Fastify, {
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify';
import { pathToFileURL } from 'node:url';

import items from 'data/items.json' with { type: 'json' };
import {
  AiChatStreamEvent,
  generateChatResponse,
  streamChatResponse,
} from 'src/ai/chat.ts';
import { generateDescriptionSuggestion } from 'src/ai/description.ts';
import { generatePriceSuggestion } from 'src/ai/price.ts';
import { createOpenRouterClient } from 'src/ai/openrouter-client.ts';
import { config } from 'src/config.ts';
import { toAdDetailsDto } from 'src/item-dto.ts';
import {
  createLoggerOptions,
  getRequestEndpoint,
  logApiErrorResponse,
} from 'src/logging.ts';
import {
  notFoundError,
  toApiErrorResponse,
  validationError,
} from 'src/errors.ts';
import { Item } from 'src/types.ts';
import {
  AiChatRequestSchema,
  AiDescriptionRequestSchema,
  AiPriceRequestSchema,
  ItemUpdateInSchema,
  ItemsGetInQuerySchema,
} from 'src/validation.ts';
import { doesItemNeedRevision } from './src/utils.ts';

const ITEMS = items as Item[];

const CORS_ALLOWED_METHODS = 'GET,PUT,POST,OPTIONS';
const CORS_ALLOWED_HEADERS = 'Content-Type';
const SSE_CONTENT_TYPE = 'text/event-stream; charset=utf-8';

const resolveAllowedOrigin = (requestOrigin: string | undefined): string | null => {
  const allowedOrigins = config.cors.allowedOrigins;

  if (allowedOrigins.includes('*')) {
    return '*';
  }

  if (!requestOrigin) {
    return null;
  }

  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
};

interface ItemGetRequest extends Fastify.RequestGenericInterface {
  Params: {
    id: string;
  };
}

interface ItemsGetRequest extends Fastify.RequestGenericInterface {
  Querystring: {
    q?: string;
    limit?: string;
    skip?: string;
    categories?: string;
    needsRevision?: string;
  };
}

interface ItemUpdateRequest extends Fastify.RequestGenericInterface {
  Params: {
    id: string;
  };
}

const parseItemId = (rawItemId: string): number => {
  const itemId = Number(rawItemId);

  if (!Number.isInteger(itemId) || itemId < 0) {
    throw validationError('Item ID path param should be a number.');
  }

  return itemId;
};

const getAiStatusResponse = (
  openRouterClient: ReturnType<typeof createOpenRouterClient>,
) => ({
  enabled: openRouterClient.enabled,
  provider: openRouterClient.enabled ? openRouterClient.provider : null,
  model: openRouterClient.enabled ? openRouterClient.model : null,
  features: {
    description: openRouterClient.enabled,
    price: openRouterClient.enabled,
    chat: openRouterClient.enabled,
  },
});

const requestAcceptsEventStream = (acceptHeader: string | undefined): boolean =>
  typeof acceptHeader === 'string' &&
  acceptHeader
    .split(',')
    .some(value => value.trim().toLowerCase().includes('text/event-stream'));

const writeSseEvent = (
  reply: FastifyReply,
  event: AiChatStreamEvent['event'] | 'error',
  data: Record<string, unknown>,
) => {
  if (reply.raw.destroyed) {
    return;
  }

  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
};

const createClientAbortHandle = (
  request: FastifyRequest,
  reply: FastifyReply,
): {
  signal: AbortSignal;
  cleanup: () => void;
} => {
  const controller = new AbortController();

  const abortRequest = () => {
    if (controller.signal.aborted) {
      return;
    }

    const abortError = new Error('The client connection was closed.');
    abortError.name = 'AbortError';
    controller.abort(abortError);

    request.log.info(
      {
        endpoint: getRequestEndpoint(request),
      },
      'Client disconnected; aborting AI request.',
    );
  };

  const handleRequestAbort = () => {
    abortRequest();
  };

  const handleReplyClose = () => {
    if (!reply.raw.writableEnded) {
      abortRequest();
    }
  };

  request.raw.on('aborted', handleRequestAbort);
  reply.raw.on('close', handleReplyClose);

  return {
    signal: controller.signal,
    cleanup: () => {
      request.raw.off('aborted', handleRequestAbort);
      reply.raw.off('close', handleReplyClose);
    },
  };
};

export const buildApp = async (
  options?: {
    logger?: FastifyServerOptions['logger'];
  },
) => {
  const fastify = Fastify({
    logger: createLoggerOptions(options?.logger),
  });

  await fastify.register((await import('@fastify/middie')).default);

  fastify.setErrorHandler((error, request, reply) => {
    const response = toApiErrorResponse(error);

    logApiErrorResponse(request, response, error);
    reply.status(response.statusCode).send(response.body);
  });

  // Искуственная задержка ответов, чтобы можно было протестировать состояния загрузки
  fastify.use((_, __, next) =>
    new Promise(res => setTimeout(res, 300 + Math.random() * 700)).then(next),
  );

  const openRouterClient = createOpenRouterClient(config.ai, fastify.log);

  // Настройка CORS и preflight
  fastify.use((request, reply, next) => {
    const allowedOrigin = resolveAllowedOrigin(request.headers.origin);

    if (allowedOrigin) {
      reply.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      reply.setHeader('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS);
      reply.setHeader('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS);

      if (allowedOrigin !== '*') {
        reply.setHeader('Vary', 'Origin');
      }
    }

    if (request.method === 'OPTIONS') {
      reply.statusCode = 204;
      reply.end();
      return;
    }

    next();
  });

  fastify.get<ItemGetRequest>('/items/:id', request => {
    const itemId = parseItemId(request.params.id);
    const item = ITEMS.find(item => item.id === itemId);

    if (!item) {
      throw notFoundError("Item with requested id doesn't exist.");
    }

    return toAdDetailsDto(item);
  });

  fastify.get<ItemsGetRequest>('/items', request => {
    const {
      q,
      limit,
      skip,
      needsRevision,
      categories,
      sortColumn,
      sortDirection,
    } = ItemsGetInQuerySchema.parse(request.query);

    const filteredItems = ITEMS.filter(item => {
      return (
        item.title.toLowerCase().includes(q.toLowerCase()) &&
        (!needsRevision || doesItemNeedRevision(item)) &&
        (!categories?.length ||
          categories.some(category => item.category === category))
      );
    });

    return {
      items: filteredItems
        .toSorted((item1, item2) => {
          let comparisonValue = 0;

          if (!sortDirection) return comparisonValue;

          if (sortColumn === 'title') {
            comparisonValue = item1.title.localeCompare(item2.title);
          } else if (sortColumn === 'createdAt') {
            comparisonValue =
              new Date(item1.createdAt).valueOf() -
              new Date(item2.createdAt).valueOf();
          } else if (sortColumn === 'price') {
            comparisonValue = (item1.price ?? 0) - (item2.price ?? 0);
          }

          return (sortDirection === 'desc' ? -1 : 1) * comparisonValue;
        })
        .slice(skip, skip + limit)
        .map(item => ({
          ...item,
          needsRevision: doesItemNeedRevision(item),
        })),
      total: filteredItems.length,
    };
  });

  fastify.put<ItemUpdateRequest>('/items/:id', request => {
    const itemId = parseItemId(request.params.id);
    const itemIndex = ITEMS.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      throw notFoundError("Item with requested id doesn't exist.");
    }

    const parsedData = ItemUpdateInSchema.parse(request.body ?? {});

    ITEMS[itemIndex] = {
      id: ITEMS[itemIndex].id,
      createdAt: ITEMS[itemIndex].createdAt,
      updatedAt: new Date().toISOString(),
      ...parsedData,
    };

    return { success: true };
  });

  fastify.get('/api/ai/status', () => getAiStatusResponse(openRouterClient));

  fastify.post('/api/ai/description', async (request, reply) => {
    const { item } = AiDescriptionRequestSchema.parse(request.body ?? {});

    const abortHandle = createClientAbortHandle(request, reply);
    try {
      return await generateDescriptionSuggestion(openRouterClient, item, {
        signal: abortHandle.signal,
      });
    } finally {
      abortHandle.cleanup();
    }
  });

  fastify.post('/api/ai/price', async (request, reply) => {
    const { item } = AiPriceRequestSchema.parse(request.body ?? {});

    const abortHandle = createClientAbortHandle(request, reply);
    try {
      return await generatePriceSuggestion(openRouterClient, item, {
        signal: abortHandle.signal,
      });
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
        return await generateChatResponse(openRouterClient, {
          item,
          messages,
          userMessage,
          signal: abortHandle.signal,
        });
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

  return fastify;
};

const port = config.port;
const isMainModule =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const main = async () => {
    const fastify = await buildApp();

    fastify.listen({ port }, function (err, _address) {
      if (err) {
        fastify.log.error(err);
        process.exit(1);
      }

      fastify.log.debug(`Server is listening on port ${port}`);
    });
  };

  void main();
}
