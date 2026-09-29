/* Producto crudo, como lo traen las fuentes (Open Food Facts, VTEX) y como lo
 * reconstruye el catálogo desde una fila de `products`. Es la entrada del motor
 * (`scoring`), de la respuesta (`toProductDetail` / `toProductSummary`) y de
 * la fila que escribe el ETL (`buildCachePayload`).
 *
 * Antes era `RawOFFProduct` en `src/types/fitogenix.ts`; en M-09 pasó al
 * dominio del catálogo con el nombre de la arquitectura (§8.2): no es solo de
 * OFF, también lo arma el adaptador de VTEX.
 */
export type RawProduct = {
  product_name?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  ingredients_text?: string;
  nutriments?: Record<string, unknown>;
  nova_group?: number;
  additives_tags?: string[];
  labels_tags?: string[];
  categories?: string;
  quantity?: string;
  serving_size?: string;
  _aiEnriched?: boolean;
  _aiSource?: boolean;
};
