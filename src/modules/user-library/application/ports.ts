/* Puertos de user-library (docs/02-arquitectura.md §8.3, ADR-0002).
 *
 * Describen las tablas `saved_products` y `scan_history` TAL COMO SE USAN HOY
 * (M-06 es una mudanza, sin cambios de comportamiento). Las filas se devuelven
 * como las entrega PostgREST, con el producto embebido (`products(*)`); el
 * caso de uso las presenta con `catalog.productResponseFromRow`. Quedan para
 * más adelante: `savedAt` / `scannedAt` en los listados (K-04) y
 * `HistoryRepository.remove` (F-01, RF-017).
 */

export type SaveResult = 'ok' | 'not_found';

export interface SavedRepository {
  /** Guardados del usuario, más reciente primero. Error de DB → lanza. */
  list(userId: string): Promise<unknown[]>;
  /** Idempotente. `not_found` si el producto no existe (FK 23503); otro error → lanza. */
  add(userId: string, productId: string): Promise<SaveResult>;
  /** Idempotente. Error de DB → lanza. */
  remove(userId: string, productId: string): Promise<void>;
}

export interface HistoryRepository {
  /** Escaneos del usuario, más reciente primero, hasta `limit`. Error de DB → lanza. */
  list(userId: string, limit: number): Promise<unknown[]>;
  /** Registra o refresca el escaneo. **Nunca lanza**: es fire-and-forget del
   *  lookup, así que loguea el error y sigue. */
  upsert(userId: string, productId: string, at: Date): Promise<void>;
}
