import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const resolveProjectPath = (...segments) => path.join(projectRoot, ...segments);

const projectAliasesPlugin = {
  name: 'project-aliases',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^(src|data)\// }, args => ({
      path: resolveProjectPath(args.path),
    }));
  },
};

await rm(resolveProjectPath('dist'), { force: true, recursive: true });

await build({
  absWorkingDir: projectRoot,
  bundle: true,
  entryPoints: [resolveProjectPath('server.ts')],
  format: 'esm',
  legalComments: 'none',
  loader: {
    '.json': 'json',
  },
  outfile: resolveProjectPath('dist/server.js'),
  packages: 'external',
  platform: 'node',
  plugins: [projectAliasesPlugin],
  sourcemap: true,
  target: 'node22',
  tsconfig: resolveProjectPath('tsconfig.json'),
});
