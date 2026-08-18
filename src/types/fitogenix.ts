import type {
  AnalyzedIngredient,
  NoScoreCode,
  NutritionFacts,
} from '../domain/product/ftgEngine';

export type { AnalyzedIngredient, NoScoreCode, NutritionFacts };

export type FitogenixProduct = {
  id: string;
  name: string;
  subtitle: string | null;
  brand: string;
  category: string;
  categoryEmoji: string;

  /**
   * `null` cuando §1 del motor dice que no se puntúa: fuera de alcance, sin
   * datos suficientes, o lista que no se pudo identificar. Es un estado de
   * primera clase, no un error — la app muestra el mensaje de `noScore` en vez
   * del número. Nunca se rellena con un valor conservador: "la ausencia de
   * datos nunca mejora un puntaje".
   */
  score: number | null;
  scoreAvailable: boolean;
  noScore: { code: NoScoreCode; message: string } | null;

  flagged: boolean;
  emoji: string;
  bgColor: string;
  imageUrl: string | null;
  ingredients: readonly AnalyzedIngredient[];
  nutrition: NutritionFacts;
  // No se manda `breakdown` (decisión de producto, 2026-08-18): la cuenta
  // paso por paso es información nuestra, no del usuario B2C — la lista de
  // ingredientes con severidad ya cubre el "por qué". El motor lo sigue
  // calculando internamente (ver ftgScoreWithBreakdown / scripts de ETL y
  // auditoría), solo que ya no cruza la red.
  dataSource: string;
  aiEnriched?: boolean;
  // Identidad del producto: uuid de la fila en `products` (migración 006).
  // Es el identificador estable que el cliente usa para guardar/quitar el
  // producto en favoritos (POST/DELETE /users/me/saved).
  productId: string;
  // ── Presentación derivada del score (calculada server-side, única fuente
  // de verdad). El cliente solo renderiza estos campos, no recalcula umbrales.
  scoreLabel: string;   // 'EXCELENTE' | 'BUENO' | 'MODERADO' | 'MALO' | 'SIN DATOS SUFICIENTES'
  scoreColor: string;   // color hex del tier
  tagline: string;      // 'Lo recomendamos', etc.
  fito: 'fito' | 'nofito' | 'none';
};

export type RawOFFProduct = {
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
