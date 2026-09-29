/* T-03 · Golden de scoreProduct sobre una muestra del catálogo real
 * (docs/05-plan.md).
 *
 * `fixtures/catalog-sample.json`: 200 filas de `products` con datos crudos
 * (las primeras 200 con ingredientes o nutrientes, en orden de `id`, tomadas
 * el 2026-09-29), sin id, barcode, marca ni imagen: solo lo que usa el motor.
 * Se mapean igual que `cacheService.rowToCachedRaw` (`category` →
 * `categories`).
 *
 * El snapshot guarda una línea por producto con puntaje, banda y motivo de
 * "sin puntaje". Si cambia un solo puntaje, falla. Un cambio a propósito del
 * motor se revisa en el diff del snapshot y se actualiza con `vitest -u` en el
 * PR del ítem que lo cambia.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreProduct, type ProductInput } from './index';

type SampleRow = {
  product_name: string | null;
  category: string | null;
  ingredients_text: string | null;
  nutriments: Record<string, unknown> | null;
  additives_tags: unknown;
};

const SAMPLE: SampleRow[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'catalog-sample.json'), 'utf8'),
);

function toInput(row: SampleRow): ProductInput {
  return {
    product_name: row.product_name ?? undefined,
    ingredients_text: row.ingredients_text ?? undefined,
    nutriments: row.nutriments ?? undefined,
    additives_tags: Array.isArray(row.additives_tags)
      ? row.additives_tags.filter((t): t is string => typeof t === 'string')
      : undefined,
    categories: row.category ?? undefined,
  };
}

describe('golden sobre la muestra del catálogo (T-03)', () => {
  it('la muestra tiene 200 productos con datos crudos', () => {
    expect(SAMPLE).toHaveLength(200);
    for (const row of SAMPLE) {
      expect(Boolean(row.ingredients_text?.trim()) || Object.keys(row.nutriments ?? {}).length > 0).toBe(true);
    }
  });

  it('puntaje, banda y motivo de cada producto', () => {
    const lineas = SAMPLE.map((row, i) => {
      const bd = scoreProduct(toInput(row));
      const nombre = (row.product_name ?? '').slice(0, 48);
      return `${String(i).padStart(3, '0')} · ${bd.score ?? '—'} · ${bd.tier}${bd.noScore ? ` (${bd.noScore.code})` : ''} · ${nombre}`;
    });
    expect(lineas.join('\n')).toMatchSnapshot();
  });
});
