// Crudo → lo que recibe la app: `ProductDetail` (lookup, detalle) y `ProductSummary`
// (listados). La presentación del puntaje sale de `scoring.presentScore`.

import {
  presentScore,
  scoreProduct,
  type Fito,
  type Highlight,
  type NoScoreCode,
  type NutritionFacts,
  type Severity,
} from '../../scoring';
import { cleanName, extractNutrition } from '../domain/productData';
import type { NutritionBasis, RawProduct } from '../domain/rawProduct';
import type { CachedProductRow } from './ports';

/** Un producto en un listado: lo justo para la fila de la lista. */
export interface ProductSummary {
  /** uuid de `products.id`: con esto se guarda, se quita y se pide el detalle. */
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /** `null` = el motor no puntúa (fuera de alcance, sin datos, sin identificar). Nunca se
   *  rellena: la ausencia de datos no mejora un puntaje. */
  score: number | null;
  /** 'EXCELENTE' | 'BUENO' | 'MODERADO' | 'MALO' | 'SIN DATOS SUFICIENTES' */
  scoreLabel: string;
  /** Color hex de la banda. */
  scoreColor: string;
}

/** Un ingrediente como lo muestra la app (§7): nombre, severidad y por qué. */
export interface ProductIngredient {
  name: string;
  sev: Severity;
  desc: string;
}

/** La pantalla de resultado: el resumen más lo que explica el puntaje. */
export interface ProductDetail extends ProductSummary {
  /** Por qué no hay puntaje; `null` si lo hay. */
  noScore: { code: NoScoreCode; message: string } | null;
  fito: Fito;
  /** Qué grupo de ingredientes destacar. */
  highlight: Highlight;
  /** En el orden de la etiqueta. No se manda `breakdown` (decisión de
   *  producto, 2026-08-18): la cuenta paso por paso es nuestra, no del
   *  usuario B2C. */
  ingredients: ProductIngredient[];
  nutrition: NutritionFacts;
  /** Sobre qué base está `nutrition`: por 100 g o por 100 ml. `null` si la fuente no lo dice. */
  nutritionBasis: NutritionBasis | null;
}

/** La identidad con la que se presenta un crudo: el uuid de la fila y el
 *  nombre a mostrar si el producto no trae uno. */
export interface ProductIdentity {
  id: string;
  fallbackName: string;
}

/** El nombre de reemplazo de una fila de `products` (listados y detalle). */
export function rowFallbackName(row: Pick<CachedProductRow, 'barcode' | 'productId'>): string {
  return row.barcode ?? row.productId;
}

function summaryOf(raw: RawProduct, identity: ProductIdentity, score: number | null): ProductSummary {
  const { label, color } = presentScore(score);
  return {
    id: identity.id,
    name: cleanName(raw.product_name, identity.fallbackName),
    brand: raw.brands || null,
    imageUrl: raw.image_front_url ?? raw.image_url ?? null,
    score,
    scoreLabel: label,
    scoreColor: color,
  };
}

export function toProductSummary(raw: RawProduct, identity: ProductIdentity): ProductSummary {
  return summaryOf(raw, identity, scoreProduct(raw).score);
}

const ALLERGEN_DECLARATION_DESC = 'Declaración de alérgenos del envase';

export function toProductDetail(raw: RawProduct, identity: ProductIdentity): ProductDetail {
  const breakdown = scoreProduct(raw);
  const { fito, highlight } = presentScore(breakdown.score);
  return {
    ...summaryOf(raw, identity, breakdown.score),
    noScore: breakdown.noScore
      ? { code: breakdown.noScore.code, message: breakdown.noScore.message }
      : null,
    fito,
    highlight,
    // Del MISMO breakdown, no de una segunda pasada: la posición de cada
    // ingrediente y su resta son parte del cálculo, así que la lista siempre
    // le corresponde al puntaje que se muestra.
    ingredients: [
      ...breakdown.ingredients.map(({ name, sev, desc }) => ({ name, sev, desc })),
      // Las declaraciones de alérgenos del envase no cuentan para el puntaje, pero siguen visibles.
      ...breakdown.allergenWarnings.map((name) => ({ name, sev: 'gray' as const, desc: ALLERGEN_DECLARATION_DESC })),
    ],
    nutrition: extractNutrition(raw.nutriments),
    nutritionBasis: raw.nutrition_basis ?? null,
  };
}
