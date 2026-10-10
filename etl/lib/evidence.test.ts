import { describe, expect, it } from 'vitest';
import {
  buildCoverage, flags, hasFourMacros, isCandidateImage, parseOffResponse, parseVtexResponse, project, selectSample,
  type CatalogRow, type CodeEvidence,
} from './evidence';

const row = (i: number, src: string, withData = true): CatalogRow => ({
  id: String(i).padStart(4, '0'), barcode: `779${i}`, data_source: src,
  ingredients_text: withData ? 'harina' : null, nutriments: null,
});

describe('selectSample', () => {
  const rows = [
    ...Array.from({ length: 600 }, (_, i) => row(i, 'jumbo')),
    ...Array.from({ length: 300 }, (_, i) => row(1000 + i, 'off')),
    ...Array.from({ length: 100 }, (_, i) => row(2000 + i, 'vea')),
    ...Array.from({ length: 50 }, (_, i) => row(3000 + i, 'jumbo', false)),
  ];
  it('respeta el tamaño, la proporción y deja afuera las filas sin datos', () => {
    const s = selectSample(rows, 100);
    expect(s).toHaveLength(100);
    expect(s.filter((r) => r.data_source === 'jumbo')).toHaveLength(60);
    expect(s.filter((r) => r.data_source === 'off')).toHaveLength(30);
    expect(s.every((r) => r.ingredients_text)).toBe(true);
  });
  it('es reproducible aunque cambie el orden de entrada', () => {
    expect(selectSample([...rows].reverse(), 100).map((r) => r.id)).toEqual(selectSample(rows, 100).map((r) => r.id));
  });
  it('reparte los restos y suma siempre n', () => {
    expect(selectSample(rows, 7)).toHaveLength(7);
  });
});

describe('hasFourMacros', () => {
  it('pide calorías, proteínas, carbohidratos y grasas', () => {
    expect(hasFourMacros({ 'energy-kcal_100g': 1, proteins_100g: 1, carbohydrates_100g: 0, fat_100g: 2 })).toBe(true);
    expect(hasFourMacros({ 'energy-kcal_100g': 1, proteins_100g: 1, fat_100g: 2 })).toBe(false);
    expect(hasFourMacros(null)).toBe(false);
  });
});

describe('parseOffResponse', () => {
  it('toma las fotos que OFF marca como ingredientes y nutrición', () => {
    const r = parseOffResponse(200, {
      status: 1,
      product: {
        image_ingredients_url: 'https://x/i.jpg', image_nutrition_url: 'https://x/n.jpg', serving_size: '10 g',
        ingredients_text: 'a', nutriments: { proteins_100g: 3 }, last_modified_t: 5,
      },
    });
    expect(r).toMatchObject({
      status: 'ok', ingredientsPhoto: 'https://x/i.jpg', nutritionPhoto: 'https://x/n.jpg', hasIngredientsText: true, hasNutriments: true, lastModified: 5,
    });
  });
  it('distingue "no está" de "no respondió"', () => {
    expect(parseOffResponse(404, null).status).toBe('no_encontrado');
    expect(parseOffResponse(200, { status: 0 }).status).toBe('no_encontrado');
    expect(parseOffResponse(503, null).status).toBe('sin_respuesta');
    expect(parseOffResponse(200, 'html').status).toBe('sin_respuesta');
  });
  it('un producto sin fotos de etiqueta es ok pero sin URLs', () => {
    expect(parseOffResponse(200, { status: 1, product: { image_front_url: 'f' } })).toMatchObject({
      status: 'ok', frontPhoto: 'f', ingredientsPhoto: undefined,
    });
  });
});

describe('parseVtexResponse', () => {
  const body = [{
    productName: 'Rhodesia',
    items: [{
      images: [
        { imageUrl: 'https://c/Rhodesia_N01.jpg' },
        { imageUrl: 'https://c/Rhodesia_N02.jpg' },
        { imageUrl: 'https://c/Rhodesia_N01.jpg' },
        { imageUrl: 'https://c/a.jpg', imageLabel: 'Tabla nutricional' },
      ],
    }],
  }];
  it('lista imágenes sin repetir y marca candidatas por nombre', () => {
    const r = parseVtexResponse(200, body);
    expect(r.status).toBe('ok');
    expect(r.images.map((i) => i.candidate)).toEqual([false, true, true]);
  });
  it('lista vacía = no encontrado; error = sin respuesta', () => {
    expect(parseVtexResponse(200, []).status).toBe('no_encontrado');
    expect(parseVtexResponse(500, null).status).toBe('sin_respuesta');
  });
  it('isCandidateImage ignora la query string', () => {
    expect(isCandidateImage('https://c/a.jpg?v=nutri')).toBe(false);
    expect(isCandidateImage('https://c/a-1.jpg')).toBe(false);
  });
});

describe('cobertura', () => {
  it('flags: una fuente que no respondió no cuenta como "sin foto"', () => {
    expect(flags({ barcode: 'x', off: { status: 'sin_respuesta' } }).sinRespuesta).toBe(true);
    expect(flags({ barcode: 'x', off: { status: 'no_encontrado' } }).sinRespuesta).toBe(false);
  });
  it('agrupa por fuente y separa los que no tienen los cuatro macros', () => {
    const sample: CatalogRow[] = [
      { ...row(1, 'off'), barcode: 'a', nutriments: { 'energy-kcal_100g': 1, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } },
      { ...row(2, 'off'), barcode: 'b' },
      { ...row(3, 'jumbo'), barcode: 'c' },
    ];
    const evidence = new Map<string, CodeEvidence>([
      ['a', { barcode: 'a', off: { status: 'ok', ingredientsPhoto: 'i', nutritionPhoto: 'n' } }],
      ['b', { barcode: 'b', off: { status: 'ok', nutritionPhoto: 'n' } }],
      ['c', { barcode: 'c', jumbo: { status: 'ok', images: [{ url: 'u', candidate: false }] } }],
    ]);
    const c = buildCoverage(sample, evidence, new Map([['off', 10], ['jumbo', 20]]));
    expect(c.total).toMatchObject({ n: 3, ing: 1, nut: 2, both: 1, vtexAny: 1 });
    expect(c.porFuente.off.n).toBe(2);
    expect(c.sinCuatroMacros).toMatchObject({ n: 2, nut: 1 });
    expect(c.proyeccion.fotoNutricionOff.estimate).toBe(10);
  });
});

describe('project', () => {
  it('estima el total; con la muestra completa el margen es 0', () => {
    expect(project([{ pop: 1000, n: 100, k: 20 }]).estimate).toBe(200);
    expect(project([{ pop: 100, n: 100, k: 20 }]).margin95).toBe(0);
    expect(project([{ pop: 1000, n: 100, k: 0 }]).margin95).toBeGreaterThan(0);
  });
});
