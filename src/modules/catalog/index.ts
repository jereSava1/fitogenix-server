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
import { lookupRoutes, type OnScan } from './routes/lookup.route';

export { productResponseFromRow } from './infrastructure/productRow';
export type { OnScan };

/** Registra `POST /products/lookup` con los adaptadores reales. `onScan` lo
 *  arma `main.ts` con user-library (catalog no lo conoce). */
export async function registerCatalog(
  app: FastifyInstance,
  deps: { onScan?: OnScan } = {},
): Promise<void> {
  const lookup = makeLookupProduct({ reader: supabaseProductReader, cache: redisProductCache });
  await app.register(lookupRoutes({ lookup, onScan: deps.onScan }));
}
