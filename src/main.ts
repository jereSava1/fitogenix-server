import 'dotenv/config';
import { config } from './platform/config';
import { buildApp } from './platform/http/buildApp';
import { productLookupRoute } from './routes/products/lookup';
import { deleteUserRoute } from './routes/users/deleteMe';
import { savedProductsRoutes } from './routes/users/saved';
import { scanHistoryRoutes } from './routes/users/history';

// Composition root: arma la app base y le registra las rutas de cada módulo.
async function start() {
  const app = await buildApp({ logger: true });

  await app.register(productLookupRoute);
  await app.register(deleteUserRoute);
  await app.register(savedProductsRoutes);
  await app.register(scanHistoryRoutes);

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
