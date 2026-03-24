import type { FastifyReply, FastifyRequest } from 'fastify';

import { getRequestEndpoint } from 'src/shared/logging/logger.ts';

export const createClientAbortHandle = (
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
