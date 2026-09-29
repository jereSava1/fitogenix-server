/* Productos guardados por usuario (favoritos): casos de uso.
 *
 * Antes eran `services/savedProductsService.ts`; desde M-06 reciben el
 * repositorio como puerto y el cableado real vive en `user-library/index.ts`.
 * Los nombres de las funciones se conservan.
 */

import type { ProductSummary } from '../../catalog';
import { summaryWithDate } from './listItem';
import type { SavedRepository, SaveResult } from './ports';

/** Un guardado: el resumen del producto y cuándo se guardó (K-04). */
export interface SavedItem extends ProductSummary {
  savedAt: string;
}

export function makeSavedProducts(repo: SavedRepository) {
  return {
    /**
     * Lista los guardados del usuario, más reciente primero, como resumen del
     * producto (puntaje recomputado desde los crudos) más `savedAt`. El
     * detalle se pide con `GET /v1/products/:id`.
     *
     * Filas cuyo producto embebido no tiene crudos o falta se OMITEN del
     * listado: mejor una lista corta que productos a medias. Errores de DB se
     * propagan como Error (la ruta responde 500).
     */
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
