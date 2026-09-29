/* API pública del módulo `user-library` (docs/02-arquitectura.md §8.3).
 *
 * Guardados e historial del usuario. Desde afuera del módulo se importa solo
 * este archivo; acá se cablean los repositorios de Supabase con los casos de
 * uso y se registran las rutas (sin contenedor de DI, §3.2).
 */

import type { FastifyInstance } from 'fastify';
import { makeScanHistory } from './application/history';
import { makeSavedProducts } from './application/saved';
import { supabaseHistoryRepository } from './infrastructure/supabaseHistoryRepository';
import { supabaseSavedRepository } from './infrastructure/supabaseSavedRepository';
import { addSharedSchemas } from '../../platform/http/schemas';
import { historyRoutes } from './routes/history.route';
import { librarySharedSchemas } from './routes/library.schema';
import { savedRoutes } from './routes/saved.route';

const savedProducts = makeSavedProducts(supabaseSavedRepository);
const scanHistory = makeScanHistory(supabaseHistoryRepository);

/** Registra `/users/me/saved` y `/users/me/history` (todas con requireAuth). */
export async function registerUserLibrary(app: FastifyInstance): Promise<void> {
  // En la raíz, para que el OpenAPI los tenga como componentes (ADR-0011).
  addSharedSchemas(app, librarySharedSchemas);
  await app.register(savedRoutes({ saved: savedProducts }));
  await app.register(historyRoutes({ history: scanHistory }));
}

/** Registra el escaneo en el historial. Nunca lanza (fire-and-forget del
 *  lookup): main.ts lo usa en el `onScan` que le pasa a catalog. */
export const recordScan = scanHistory.recordScan;
