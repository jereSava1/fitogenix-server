import 'dotenv/config';
import { config } from './platform/config';
import { buildApp, LOG_REDACT } from './platform/http/buildApp';
import { registerModules } from './registerModules';

// Composition root: arma la app base, le registra las rutas de cada módulo y
// escucha.
async function start() {
  const app = await buildApp(
    {
      logger: { redact: LOG_REDACT },
      trustProxy: config.trustProxyHops > 0 ? config.trustProxyHops : false,
    },
    { corsOrigins: config.corsOrigins },
  );
  await registerModules(app);
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
