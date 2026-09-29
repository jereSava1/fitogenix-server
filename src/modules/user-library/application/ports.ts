// Puertos de user-library. Las filas llegan como las entrega PostgREST, con el producto
// embebido (`products(*)`).

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
