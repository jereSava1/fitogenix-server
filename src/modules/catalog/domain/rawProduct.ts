// Producto crudo, como lo traen las fuentes (OFF, VTEX) o se reconstruye de `products`.
export type RawProduct = {
  product_name?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  ingredients_text?: string;
  nutriments?: Record<string, unknown>;
  additives_tags?: string[];
  labels_tags?: string[];
  categories?: string;
  quantity?: string;
  serving_size?: string;
  _aiEnriched?: boolean;
  _aiSource?: boolean;
};
