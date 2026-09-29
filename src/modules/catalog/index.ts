/* API pública del módulo `catalog` (docs/02-arquitectura.md §8.2, ADR-0002).
 *
 * Desde afuera del módulo se importa solo este archivo. Acá se hace el
 * cableado a mano (sin contenedor de DI, §3.2): se crean los adaptadores, se
 * le pasan a los casos de uso y se registran las rutas.
 */

import type { FastifyInstance } from 'fastify';
import { makeGetProduct } from './application/getProduct';
import { makeLookupProduct } from './application/lookupProduct';
import { redisProductCache } from './infrastructure/redisProductCache';
import { supabaseProductReader } from './infrastructure/supabaseProductReader';
import { addSharedSchemas, ApiErrorSchema } from '../../platform/http/schemas';
import { productRoutes } from './routes/getProduct.route';
import { lookupRoutes, type OnScan } from './routes/lookup.route';
import { ProductDetailSchema, ProductSummarySchema } from './routes/product.schema';

// Para los listados de user-library: el resumen de un producto desde la fila
// join y su schema (K-04).
export { productSummaryFromRow } from './infrastructure/productRow';
export { ProductSummarySchema };
export type { OnScan };

// Para el ETL (ADR-0004): el payload que persiste en `products`, calculado con
// el mismo código que el server.
export { buildCachePayload } from './infrastructure/supabaseProductWriter';

// Tipos del catálogo (M-09: antes en src/types/fitogenix.ts).
export type { ProductDetail, ProductSummary } from './application/productResponse';
export type { RawProduct } from './domain/rawProduct';

/** Registra `POST /products/lookup` y `GET /products/:id` con los adaptadores
 *  reales. `onScan` lo arma `registerModules` con user-library (catalog no lo
 *  conoce). */
export async function registerCatalog(
  app: FastifyInstance,
  deps: { onScan?: OnScan } = {},
): Promise<void> {
  // En la raíz, para que el OpenAPI los tenga como componentes (ADR-0011).
  // `ProductSummary` no lo referencia ninguna ruta (los ítems de los listados
  // lo extienden aplanado), pero native lo usa como tipo con nombre.
  addSharedSchemas(app, [ApiErrorSchema, ProductSummarySchema, ProductDetailSchema]);
  const lookup = makeLookupProduct({ reader: supabaseProductReader, cache: redisProductCache });
  const getProduct = makeGetProduct({ reader: supabaseProductReader });
  await app.register(lookupRoutes({ lookup, onScan: deps.onScan }));
  await app.register(productRoutes({ getProduct }));
}
