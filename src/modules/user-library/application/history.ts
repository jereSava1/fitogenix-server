// Historial por usuario. Re-escanear actualiza `scanned_at` (una fila por producto).
// El registro es fire-and-forget desde el lookup: nunca lo demora ni lo rompe.

import type { ProductSummary } from '../../catalog';
import { summaryWithDate } from './listItem';
import type { HistoryRepository } from './ports';

/** Un escaneo: el resumen del producto y cuándo se escaneó por última vez. */
export interface HistoryItem extends ProductSummary {
  scannedAt: string;
}

export function makeScanHistory(repo: HistoryRepository) {
  return {
    /** Registra (o refresca) un escaneo del usuario. Nunca lanza. */
    recordScan(userId: string, productId: string): Promise<void> {
      return repo.upsert(userId, productId, new Date());
    },

    /** Borra el producto del historial del usuario. Idempotente (RF-017). */
    removeFromHistory(userId: string, productId: string): Promise<void> {
      return repo.remove(userId, productId);
    },

    /** Más reciente primero. Omite filas sin producto o sin crudos; un error de base se
     *  propaga (500). */
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
