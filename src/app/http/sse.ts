import type { FastifyReply } from 'fastify';

export const SSE_CONTENT_TYPE = 'text/event-stream; charset=utf-8';

export const requestAcceptsEventStream = (
  acceptHeader: string | undefined,
): boolean =>
  typeof acceptHeader === 'string' &&
  acceptHeader
    .split(',')
    .some(value => value.trim().toLowerCase().includes('text/event-stream'));

export const writeSseEvent = (
  reply: FastifyReply,
  event: string,
  data: Record<string, unknown>,
): void => {
  if (reply.raw.destroyed) {
    return;
  }

  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
};
