import 'dotenv/config';
import { config } from './platform/config';
import { buildApp } from './platform/http/buildApp';
import { registerCatalog } from './modules/catalog';
import { recordScan, resolveUserIdFromToken } from './services/scanHistoryService';
import { deleteUserRoute } from './routes/users/deleteMe';
import { savedProductsRoutes } from './routes/users/saved';
import { scanHistoryRoutes } from './routes/users/history';

// Composition root: arma la app base y le registra las rutas de cada módulo.
async function start() {
  const app = await buildApp({ logger: true });

  // El registro del escaneo se inyecta en catalog (02-arquitectura §3.3): el
  // usuario se resuelve desde el token y el escaneo va al historial.
  await registerCatalog(app, {
    onScan: async ({ token, productId }) => {
      const userId = await resolveUserIdFromToken(token);
      if (userId) await recordScan(userId, productId);
    },
  });
  await app.register(deleteUserRoute);
  await app.register(savedProductsRoutes);
  await app.register(scanHistoryRoutes);

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
