import type {
  AnalyzedIngredient,
  NutritionFacts,
  ScoreBreakdown,
} from '../domain/product/ftgEngine';

export type { AnalyzedIngredient, NutritionFacts, ScoreBreakdown };

export type Subscores = {
  toxicidad: number;
  nutricion: number;
  procesamiento: number;
  alineacion: number;
};

export type FitogenixProduct = {
  id: string;
  name: string;
  subtitle: string | null;
  brand: string;
  category: string;
  categoryEmoji: string;
  score: number;
  flagged: boolean;
  emoji: string;
  bgColor: string;
  imageUrl: string | null;
  summary: string | null;
  ingredients: AnalyzedIngredient[];
  nutrition: NutritionFacts;
  subscores: Subscores;
  breakdown: ScoreBreakdown | null;
  alternatives: unknown[];
  dataSource: string;
  aiEnriched?: boolean;
  // ── Presentación derivada del score (calculada server-side, única fuente
  // de verdad). El cliente solo renderiza estos campos, no recalcula umbrales.
  scoreLabel: string;   // 'EXCELENTE' | 'BUENO' | 'MODERADO' | 'MALO'
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
