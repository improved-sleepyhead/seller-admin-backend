import type { FastifyInstance } from 'fastify';

import { config } from 'src/shared/config/app-config.ts';

const CORS_ALLOWED_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS';
const DEFAULT_CORS_ALLOWED_HEADERS =
  'Authorization,Content-Type,Accept,Origin,X-Requested-With';
const CORS_MAX_AGE_SECONDS = '86400';

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

const resolveAllowedHeaders = (
  requestHeaders: string | string[] | undefined,
): string => {
  if (Array.isArray(requestHeaders)) {
    const joinedHeaders = requestHeaders
      .map(headerValue => headerValue.trim())
      .filter(Boolean)
      .join(', ');

    return joinedHeaders || DEFAULT_CORS_ALLOWED_HEADERS;
  }

  const normalizedHeaders = requestHeaders?.trim();
  return normalizedHeaders || DEFAULT_CORS_ALLOWED_HEADERS;
};

export const registerCorsPlugin = (fastify: FastifyInstance): void => {
  fastify.use((request, reply, next) => {
    const allowedOrigin = resolveAllowedOrigin(request.headers.origin);

    if (allowedOrigin) {
      reply.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      reply.setHeader('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS);
      reply.setHeader(
        'Access-Control-Allow-Headers',
        resolveAllowedHeaders(request.headers['access-control-request-headers']),
      );
      reply.setHeader('Access-Control-Max-Age', CORS_MAX_AGE_SECONDS);

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
};
