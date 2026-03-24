import Fastify from 'fastify';

import items from 'data/items.json' with { type: 'json' };
import { config } from 'src/config.ts';
import {
  notFoundError,
  toApiErrorResponse,
  validationError,
} from 'src/errors.ts';
import { Item } from 'src/types.ts';
import { ItemsGetInQuerySchema, ItemUpdateInSchema } from 'src/validation.ts';
import { doesItemNeedRevision } from './src/utils.ts';

const ITEMS = items as Item[];

const CORS_ALLOWED_METHODS = 'GET,PUT,POST,OPTIONS';
const CORS_ALLOWED_HEADERS = 'Content-Type';

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

export const buildApp = async () => {
  const fastify = Fastify({
    logger: true,
  });

  await fastify.register((await import('@fastify/middie')).default);

  fastify.setErrorHandler((error, request, reply) => {
    const { statusCode, body } = toApiErrorResponse(error);

    if (statusCode >= 500) {
      request.log.error({ err: error, code: body.code }, body.message);
    } else {
      request.log.info({ code: body.code }, body.message);
    }

    reply.status(statusCode).send(body);
  });

  // Искуственная задержка ответов, чтобы можно было протестировать состояния загрузки
  fastify.use((_, __, next) =>
    new Promise(res => setTimeout(res, 300 + Math.random() * 700)).then(next),
  );

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

    return {
      ...item,
      needsRevision: doesItemNeedRevision(item),
    };
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
          }

          return (sortDirection === 'desc' ? -1 : 1) * comparisonValue;
        })
        .slice(skip, skip + limit)
        .map(item => ({
          category: item.category,
          title: item.title,
          price: item.price,
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

    const parsedData = ItemUpdateInSchema.parse({
      category: ITEMS[itemIndex].category,
      ...(request.body as {}),
    });

    ITEMS[itemIndex] = {
      id: ITEMS[itemIndex].id,
      createdAt: ITEMS[itemIndex].createdAt,
      updatedAt: new Date().toISOString(),
      ...parsedData,
    };

    return { success: true };
  });

  return fastify;
};

const port = config.port;
const fastify = await buildApp();

fastify.listen({ port }, function (err, _address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  fastify.log.debug(`Server is listening on port ${port}`);
});
