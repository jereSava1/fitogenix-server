import { beforeAll, describe, expect, it } from 'vitest';

// config.ts exige ANTHROPIC_API_KEY/SUPABASE_* al importarse (throws si
// faltan) — mismo patrón que src/services/cacheService.test.ts: seteamos
// env vars dummy ANTES de importar el módulo (import dinámico, no estático),
// así el import no explota en un entorno sin .env real. Solo testeamos los
// parsers puros, nunca se llega a instanciar el cliente de Anthropic.
type QualityAIModule = typeof import('./qualityAI');
let parseIngredientsExtraction: QualityAIModule['parseIngredientsExtraction'];
let parseBrandExtraction: QualityAIModule['parseBrandExtraction'];

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  ({ parseIngredientsExtraction, parseBrandExtraction } = await import('./qualityAI'));
});

describe('parseIngredientsExtraction', () => {
  it('parsea una extracción completa con ingredientes y fabricante', () => {
    const result = parseIngredientsExtraction(
      JSON.stringify({
        isCorrupted: true,
        realIngredients: 'harina de trigo, azúcar, cacao',
        manufacturerInfo: 'Elaborado por Molinos SA, Ruta 9 Km 50',
      }),
    );
    expect(result).toEqual({
      isCorrupted: true,
      realIngredients: 'harina de trigo, azúcar, cacao',
      manufacturerInfo: 'Elaborado por Molinos SA, Ruta 9 Km 50',
    });
  });

  it('devuelve realIngredients null cuando no hay nada rescatable', () => {
    const result = parseIngredientsExtraction(
      JSON.stringify({ isCorrupted: true, realIngredients: null, manufacturerInfo: null }),
    );
    expect(result.realIngredients).toBeNull();
  });

  it('trata "{}" (respuesta vacía de Claude) como no rescatable', () => {
    const result = parseIngredientsExtraction('{}');
    expect(result.isCorrupted).toBe(true);
    expect(result.realIngredients).toBeNull();
  });

  it('trata JSON inválido como no rescatable, sin crashear', () => {
    const result = parseIngredientsExtraction('esto no es json');
    expect(result.isCorrupted).toBe(true);
    expect(result.realIngredients).toBeNull();
  });

  it('trata string vacío como no rescatable', () => {
    const result = parseIngredientsExtraction('');
    expect(result.realIngredients).toBeNull();
  });

  it('ignora campos con tipo incorrecto en vez de crashear', () => {
    const result = parseIngredientsExtraction(JSON.stringify({ realIngredients: 123, manufacturerInfo: [] }));
    expect(result.realIngredients).toBeNull();
    expect(result.manufacturerInfo).toBeNull();
  });
});

describe('parseBrandExtraction', () => {
  it('extrae una marca válida', () => {
    expect(parseBrandExtraction(JSON.stringify({ brand: 'La Serenísima' }))).toBe('La Serenísima');
  });

  it('devuelve null cuando Claude no identifica marca', () => {
    expect(parseBrandExtraction(JSON.stringify({ brand: null }))).toBeNull();
  });

  it('devuelve null para "{}"', () => {
    expect(parseBrandExtraction('{}')).toBeNull();
  });

  it('devuelve null para JSON inválido', () => {
    expect(parseBrandExtraction('no es json')).toBeNull();
  });

  it('devuelve null para string vacío', () => {
    expect(parseBrandExtraction('')).toBeNull();
  });

  it('devuelve null si brand viene vacío/blanco', () => {
    expect(parseBrandExtraction(JSON.stringify({ brand: '   ' }))).toBeNull();
  });
});
