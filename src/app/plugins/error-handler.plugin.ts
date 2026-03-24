import type { FastifyInstance } from 'fastify';

import { toApiErrorResponse } from 'src/shared/errors/api-error.mapper.ts';
import { logApiErrorResponse } from 'src/shared/logging/logger.ts';

export const registerErrorHandlerPlugin = (fastify: FastifyInstance): void => {
  fastify.setErrorHandler((error, request, reply) => {
    const response = toApiErrorResponse(error);

    logApiErrorResponse(request, response, error);
    reply.status(response.statusCode).send(response.body);
  });
};
