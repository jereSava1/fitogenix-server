import 'dotenv/config';
import { config } from './platform/config';
import { buildApp } from './platform/http/buildApp';
import { registerModules } from './registerModules';

// Composition root: arma la app base, le registra las rutas de cada módulo y
// escucha.
async function start() {
  const app = await buildApp({ logger: true });
  await registerModules(app);
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
