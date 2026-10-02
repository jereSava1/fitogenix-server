import type { ProductSummary } from '../../catalog';
import { summaryWithDate } from './listItem';
import type { SavedRepository, SaveResult } from './ports';

/** Un guardado: el resumen del producto y cuándo se guardó. */
export interface SavedItem extends ProductSummary {
  savedAt: string;
}

export function makeSavedProducts(repo: SavedRepository) {
  return {
    /** Más reciente primero. Omite filas sin producto o sin crudos; un error de base se
     *  propaga (500). */
    async listSavedProducts(userId: string): Promise<SavedItem[]> {
      const rows = await repo.list(userId);
      const items: SavedItem[] = [];

      for (const rowUnknown of rows) {
        const item = summaryWithDate(rowUnknown, 'created_at');
        if (item) items.push({ ...item.product, savedAt: item.at });
      }

      return items;
    },

    /** Guarda un producto para el usuario. Idempotente; `not_found` si el
     *  productId no existe en `products`. */
    saveProduct(userId: string, productId: string): Promise<SaveResult> {
      return repo.add(userId, productId);
    },

    /** Quita un producto de los guardados del usuario. Idempotente. */
    removeSavedProduct(userId: string, productId: string): Promise<void> {
      return repo.remove(userId, productId);
    },
  };
}

export type SavedProducts = ReturnType<typeof makeSavedProducts>;
