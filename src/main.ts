import 'dotenv/config';
import { config } from './platform/config';
import { buildApp } from './platform/http/buildApp';
import { resolveUserIdFromToken } from './platform/http/auth';
import { registerCatalog } from './modules/catalog';
import { recordScan, registerUserLibrary } from './modules/user-library';
import { registerAccount } from './modules/account';

// Composition root: arma la app base y le registra las rutas de cada módulo.
async function start() {
  const app = await buildApp({ logger: true });

  // El registro del escaneo se inyecta en catalog (02-arquitectura §3.3): el
  // usuario se resuelve desde el token y el escaneo va al historial de
  // user-library. catalog no conoce a user-library.
  await registerCatalog(app, {
    onScan: async ({ token, productId }) => {
      const userId = await resolveUserIdFromToken(token);
      if (userId) await recordScan(userId, productId);
    },
  });
  await registerAccount(app);
  await registerUserLibrary(app);

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
