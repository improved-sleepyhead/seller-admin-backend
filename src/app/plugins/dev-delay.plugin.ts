import type { FastifyInstance } from 'fastify';

export const registerDevDelayPlugin = (fastify: FastifyInstance): void => {
  fastify.use((_, __, next) =>
    new Promise(res => setTimeout(res, 300 + Math.random() * 700)).then(next),
  );
};
