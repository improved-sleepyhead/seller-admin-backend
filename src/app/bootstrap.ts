import { pathToFileURL } from 'node:url';

import { config } from 'src/shared/config/app-config.ts';

import { buildApp } from './build-app.ts';

export const isMainModule = (
  entryFile: string | undefined,
  moduleUrl: string,
): boolean =>
  typeof entryFile === 'string' &&
  moduleUrl === pathToFileURL(entryFile).href;

export const startServer = async (): Promise<void> => {
  const fastify = await buildApp();
  const port = config.port;
  const host = config.host;

  fastify.listen({ port, host }, function (err, _address) {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }

    fastify.log.debug(`Server is listening on ${host}:${port}`);
  });
};
