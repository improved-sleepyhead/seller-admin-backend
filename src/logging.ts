import type {
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify';
import type { ApiErrorResponse } from 'src/errors.ts';

type LoggerOptions = Exclude<FastifyServerOptions['logger'], boolean | undefined>;

const getSafePathname = (value: string): string => {
  try {
    return new URL(value, 'http://localhost').pathname;
  } catch {
    return value.split('?')[0] ?? value;
  }
};

export const getRequestEndpoint = (request: FastifyRequest): string =>
  typeof request.routeOptions.url === 'string'
    ? request.routeOptions.url
    : getSafePathname(request.url);

export const createLoggerOptions = (
  logger?: FastifyServerOptions['logger'],
): FastifyServerOptions['logger'] => {
  if (logger === false) {
    return false;
  }

  const safeSerializers = {
    req: (request: { method?: string; url?: string }) => ({
      method: request.method,
      endpoint: getSafePathname(request.url ?? ''),
    }),
    res: (reply: { statusCode?: number }) => ({
      statusCode: reply.statusCode,
    }),
  };

  if (!logger || logger === true) {
    return {
      level: 'info',
      serializers: safeSerializers,
    };
  }

  return {
    ...logger,
    serializers: {
      ...safeSerializers,
      ...(logger as LoggerOptions).serializers,
    },
  };
};

export const logApiErrorResponse = (
  request: FastifyRequest,
  response: {
    statusCode: number;
    body: ApiErrorResponse;
  },
  error: unknown,
): void => {
  const metadata = {
    endpoint: getRequestEndpoint(request),
    method: request.method,
    statusCode: response.statusCode,
    code: response.body.code,
    ...(error instanceof Error ? { errorName: error.name } : {}),
  };

  if (response.statusCode >= 500) {
    request.log.error(metadata, response.body.message);
    return;
  }

  request.log.info(metadata, response.body.message);
};
