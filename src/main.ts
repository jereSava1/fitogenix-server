import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { productLookupRoute } from './routes/products/lookup';
import { productImageRoute } from './routes/products/image';
import { deleteUserRoute } from './routes/users/deleteMe';
import { savedProductsRoutes } from './routes/users/saved';
import { scanHistoryRoutes } from './routes/users/history';

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, {
    origin: true,
  });

  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Demasiadas solicitudes. Intentá de nuevo en un momento.',
    }),
  });

  await app.register(productLookupRoute);
  await app.register(productImageRoute);
  await app.register(deleteUserRoute);
  await app.register(savedProductsRoutes);
  await app.register(scanHistoryRoutes);

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
