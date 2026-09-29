/* Historial de escaneos por usuario: casos de uso.
 *
 * Re-escanear un producto NO agrega fila: el upsert actualiza scanned_at, así
 * la tabla queda acotada a productos distintos por usuario.
 *
 * El registro se dispara fire-and-forget desde POST /products/lookup
 * (catalog, vía el onScan que arma main.ts): NUNCA debe demorar ni romper la
 * respuesta del lookup, por eso el repositorio loguea errores en vez de
 * propagarlos. Antes era `services/scanHistoryService.ts` (M-06); los nombres
 * de las funciones se conservan.
 */

import { productResponseFromRow } from '../../catalog';
import type { FitogenixProduct } from '../../../types/fitogenix';
import type { HistoryRepository } from './ports';

export function makeScanHistory(repo: HistoryRepository) {
  return {
    /** Registra (o refresca) un escaneo del usuario. Nunca lanza. */
    recordScan(userId: string, productId: string): Promise<void> {
      return repo.upsert(userId, productId, new Date());
    },

    /**
     * Lista el historial del usuario, escaneo más reciente primero, como
     * FitogenixProduct completos (score recomputado desde los crudos).
     *
     * Filas cuyo producto embebido falta o no tiene crudos se OMITEN (mismo
     * criterio que listSavedProducts). Errores de DB se propagan como Error
     * (la ruta responde 500).
     */
    async listScanHistory(userId: string, limit: number): Promise<FitogenixProduct[]> {
      const rows = await repo.list(userId, limit);
      const items: FitogenixProduct[] = [];

      for (const rowUnknown of rows) {
        const product = productResponseFromRow(rowUnknown);
        if (product) items.push(product);
      }

      return items;
    },
  };
}

export type ScanHistory = ReturnType<typeof makeScanHistory>;
