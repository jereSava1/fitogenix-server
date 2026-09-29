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

import type { ProductSummary } from '../../catalog';
import { summaryWithDate } from './listItem';
import type { HistoryRepository } from './ports';

/** Un escaneo: el resumen del producto y cuándo se escaneó por última vez
 *  (K-04). */
export interface HistoryItem extends ProductSummary {
  scannedAt: string;
}

export function makeScanHistory(repo: HistoryRepository) {
  return {
    /** Registra (o refresca) un escaneo del usuario. Nunca lanza. */
    recordScan(userId: string, productId: string): Promise<void> {
      return repo.upsert(userId, productId, new Date());
    },

    /**
     * Lista el historial del usuario, escaneo más reciente primero, como
     * resumen del producto (puntaje recomputado desde los crudos) más
     * `scannedAt`. El detalle se pide con `GET /v1/products/:id`.
     *
     * Filas cuyo producto embebido falta o no tiene crudos se OMITEN (mismo
     * criterio que listSavedProducts). Errores de DB se propagan como Error
     * (la ruta responde 500).
     */
    async listScanHistory(userId: string, limit: number): Promise<HistoryItem[]> {
      const rows = await repo.list(userId, limit);
      const items: HistoryItem[] = [];

      for (const rowUnknown of rows) {
        const item = summaryWithDate(rowUnknown, 'scanned_at');
        if (item) items.push({ ...item.product, scannedAt: item.at });
      }

      return items;
    },
  };
}

export type ScanHistory = ReturnType<typeof makeScanHistory>;
