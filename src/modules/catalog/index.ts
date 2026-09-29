/* API pública del módulo `catalog` (docs/02-arquitectura.md §8.2, ADR-0002).
 *
 * Desde afuera del módulo se importa solo este archivo. Acá se hace el
 * cableado a mano (sin contenedor de DI, §3.2): se crean los adaptadores, se
 * le pasan al caso de uso y se registran las rutas.
 */

import type { FastifyInstance } from 'fastify';
import { makeLookupProduct } from './application/lookupProduct';
import { redisProductCache } from './infrastructure/redisProductCache';
import { supabaseProductReader } from './infrastructure/supabaseProductReader';
import { addSharedSchemas, ApiErrorSchema } from '../../platform/http/schemas';
import { lookupRoutes, type OnScan } from './routes/lookup.route';
import { ProductSchema } from './routes/lookup.schema';

export { productResponseFromRow } from './infrastructure/productRow';
export { ProductSchema } from './routes/lookup.schema';
export type { OnScan };

// Para el ETL (ADR-0004): arma la respuesta y el payload que persiste en
// `products` con el mismo código que el server.
export { mapRawToProduct } from './application/productResponse';
export { buildCachePayload } from './infrastructure/supabaseProductWriter';

// Tipos del catálogo (M-09: antes en src/types/fitogenix.ts).
export type { FitogenixProduct } from './application/productResponse';
export type { RawProduct } from './domain/rawProduct';

/** Registra `POST /products/lookup` con los adaptadores reales. `onScan` lo
 *  arma `main.ts` con user-library (catalog no lo conoce). */
export async function registerCatalog(
  app: FastifyInstance,
  deps: { onScan?: OnScan } = {},
): Promise<void> {
  // En la raíz, para que el OpenAPI los tenga como componentes (ADR-0011).
  addSharedSchemas(app, [ApiErrorSchema, ProductSchema]);
  const lookup = makeLookupProduct({ reader: supabaseProductReader, cache: redisProductCache });
  await app.register(lookupRoutes({ lookup, onScan: deps.onScan }));
}
