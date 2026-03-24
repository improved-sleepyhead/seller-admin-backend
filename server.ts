export { buildApp } from 'src/app/build-app.ts';

import { isMainModule, startServer } from 'src/app/bootstrap.ts';

if (isMainModule(process.argv[1], import.meta.url)) {
  void startServer();
}
