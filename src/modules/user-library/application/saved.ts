/* Productos guardados por usuario (favoritos): casos de uso.
 *
 * Antes eran `services/savedProductsService.ts`; desde M-06 reciben el
 * repositorio como puerto y el cableado real vive en `user-library/index.ts`.
 * Los nombres de las funciones se conservan.
 */

import { productResponseFromRow } from '../../catalog';
import type { FitogenixProduct } from '../../catalog';
import type { SavedRepository, SaveResult } from './ports';

export function makeSavedProducts(repo: SavedRepository) {
  return {
    /**
     * Lista los guardados del usuario, más reciente primero, como
     * FitogenixProduct completos (score recomputado desde los crudos).
     *
     * Filas cuyo producto embebido no tiene crudos o falta (productResponseFromRow →
     * null) se OMITEN del listado: mejor una lista corta que productos con
     * breakdown incompleto. Errores de DB se propagan como Error (la ruta
     * responde 500).
     */
    async listSavedProducts(userId: string): Promise<FitogenixProduct[]> {
      const rows = await repo.list(userId);
      const items: FitogenixProduct[] = [];

      for (const rowUnknown of rows) {
        const product = productResponseFromRow(rowUnknown);
        if (product) items.push(product);
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
