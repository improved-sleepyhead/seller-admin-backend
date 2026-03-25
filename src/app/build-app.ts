import Fastify, { FastifyServerOptions } from 'fastify';

import { createOpenRouterClient } from 'src/modules/ai/providers/openrouter/openrouter.client.ts';
import { registerAiRoutes } from 'src/modules/ai/routes/ai.routes.ts';
import { createInMemoryItemsRepository } from 'src/modules/items/repository/in-memory-items.repository.ts';
import { registerItemRoutes } from 'src/modules/items/routes/items.routes.ts';
import { createItemsService } from 'src/modules/items/service/items.service.ts';
import { config } from 'src/shared/config/app-config.ts';
import { createLoggerOptions } from 'src/shared/logging/logger.ts';

import { registerCorsPlugin } from './plugins/cors.plugin.ts';
import { registerDevDelayPlugin } from './plugins/dev-delay.plugin.ts';
import { registerErrorHandlerPlugin } from './plugins/error-handler.plugin.ts';
import { registerSwaggerPlugin } from './plugins/swagger.plugin.ts';

export const buildApp = async (
  options?: {
    logger?: FastifyServerOptions['logger'];
  },
) => {
  const fastify = Fastify({
    logger: createLoggerOptions(options?.logger),
  });

  await fastify.register((await import('@fastify/middie')).default);

  registerErrorHandlerPlugin(fastify);
  registerDevDelayPlugin(fastify, {
    enabled: config.dev.delayEnabled,
  });
  registerCorsPlugin(fastify);
  await registerSwaggerPlugin(fastify);

  const openRouterClient = createOpenRouterClient(config.ai, fastify.log);
  const itemsService = createItemsService(createInMemoryItemsRepository());

  registerItemRoutes(fastify, itemsService);
  registerAiRoutes(fastify, openRouterClient);

  return fastify;
};
