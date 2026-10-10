/** Sobre qué base está la nutrición: por 100 g o por 100 ml. Ausente si la fuente no lo dice. */
export type NutritionBasis = '100g' | '100ml';

// Producto crudo, como lo traen las fuentes (OFF, VTEX) o se reconstruye de `products`.
export type RawProduct = {
  product_name?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  ingredients_text?: string;
  nutriments?: Record<string, unknown>;
  /** La base de `nutriments`; viaja con el bloque, de la misma fuente. */
  nutrition_basis?: NutritionBasis;
  additives_tags?: string[];
  labels_tags?: string[];
  categories?: string;
  quantity?: string;
  serving_size?: string;
  _aiEnriched?: boolean;
};
