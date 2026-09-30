// Fija la fila que escribe el ETL para los 200 productos de la muestra: las columnas
// derivadas van al snapshot; los crudos se verifican aparte.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RawProduct } from '../domain/rawProduct';
import { buildCachePayload } from './supabaseProductWriter';

/** Cómo arman su fila los jobs del ETL (`runMerge`, `enrichCencosud`). */
function etlRowFor(raw: RawProduct, barcode: string): Record<string, unknown> {
  return buildCachePayload(raw, barcode);
}

const muestra = JSON.parse(
  readFileSync(join(__dirname, '../../scoring/domain/fixtures/catalog-sample.json'), 'utf8'),
) as Record<string, unknown>[];

/** La muestra solo trae los crudos del motor: se varían marca, imagen y
 *  origen para cubrir cada rama de la fila (con y sin marca, `ai`, IA). */
function rawDe(row: Record<string, unknown>, i: number): RawProduct {
  return {
    product_name: row.product_name as string | undefined,
    categories: row.category as string | undefined,
    ingredients_text: row.ingredients_text as string | undefined,
    nutriments: row.nutriments as Record<string, unknown> | undefined,
    additives_tags: row.additives_tags as string[] | undefined,
    brands: i % 3 === 0 ? undefined : `Marca ${i}`,
    image_url: i % 4 === 0 ? undefined : `https://img.test/${i}.jpg`,
    _aiSource: i % 7 === 0,
    _aiEnriched: i % 6 === 0,
  };
}

const DERIVADAS = [
  'barcode', 'product_name', 'brand', 'category', 'image_url', 'data_source', 'ai_enriched',
] as const;

describe('fila que escribe el ETL en products (caracterización K-04)', () => {
  const filas = muestra.map((row, i) => {
    const raw = rawDe(row, i);
    const barcode = String(7790000000000 + i);
    return { raw, fila: etlRowFor(raw, barcode) };
  });

  it('columnas derivadas de los 200 productos de la muestra', () => {
    expect(filas).toHaveLength(200);
    const derivadas = filas.map(({ fila }) =>
      Object.fromEntries(DERIVADAS.map((k) => [k, fila[k]])),
    );
    expect(derivadas).toMatchSnapshot();
  });

  it('los crudos pasan tal cual y siempre hay updated_at', () => {
    for (const { raw, fila } of filas) {
      expect(fila.ingredients_text).toBe(raw.ingredients_text ?? null);
      expect(fila.nutriments).toEqual(raw.nutriments ?? null);
      expect(fila.additives_tags).toEqual(raw.additives_tags ?? null);
      expect(typeof fila.updated_at).toBe('string');
      expect(Object.keys(fila).sort()).toEqual(
        [...DERIVADAS, 'ingredients_text', 'nutriments', 'additives_tags', 'updated_at'].sort(),
      );
    }
  });
});
