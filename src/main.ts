import 'dotenv/config';
import { config } from './platform/config';
import { logger } from './platform/logger';
import { buildApp } from './platform/http/buildApp';
import { registerReadiness } from './platform/http/health';
import { closeOnSignals } from './platform/http/shutdown';
import { registerModules } from './registerModules';

// Composition root: arma la app base, le registra las rutas de cada módulo y
// escucha.
async function start() {
  const app = await buildApp(
    {
      loggerInstance: logger,
      trustProxy: config.trustProxy.length > 0 ? config.trustProxy : false,
    },
    { corsOrigins: config.corsOrigins },
  );
  registerReadiness(app);
  await registerModules(app);
  closeOnSignals(app);
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start().catch((err) => {
  logger.fatal({ err }, 'El server no arrancó');
  process.exit(1);
});
