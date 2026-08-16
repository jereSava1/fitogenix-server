import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawOFFProduct } from '../types/fitogenix';

// ── Mock del SDK de Anthropic ──
// `new Anthropic({...})` debe devolver un objeto con `messages.create()` —
// vi.fn() como constructor usa el valor de retorno de mockImplementation
// como la instancia (comportamiento estándar de `new` sobre una función que
// retorna un objeto).
let mockResponseText = '{}';
const messagesCreate = vi.fn(async () => ({
  content: [{ type: 'text', text: mockResponseText }],
}));

vi.mock('@anthropic-ai/sdk', () => ({
  // __esModule: true — sin esto, el helper de interop de default-import
  // (paquete "type": "commonjs") re-envuelve el factory en otro
  // { default: ... }, rompiendo la resolución de `Anthropic`.
  //
  // `function` en vez de arrow function en mockImplementation — `new
  // Anthropic(...)` en claudeService.ts usa `new` sobre el mock; una arrow
  // function no es invocable con `new` (TypeError silencioso que Vitest
  // logueaba como warning, no como fallo de test). Con `function` sí
  // funciona como constructor.
  //
  // Ambos bugs se manifestaban IGUAL: el catch de enrichWithAI se comía el
  // error y devolvía el producto sin tocar — los tests que esperaban "no
  // pasa nada" pasaban igual, por la razón equivocada, y solo los que
  // esperaban una mutación real fallaban. Ver el debug con `messagesCreate.
  // mock.calls.length === 0` que confirmó la causa.
  __esModule: true,
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { create: messagesCreate } };
  }),
}));

type ClaudeServiceModule = typeof import('./claudeService');
let enrichWithAI: ClaudeServiceModule['enrichWithAI'];
let aiLookupProduct: ClaudeServiceModule['aiLookupProduct'];

beforeAll(async () => {
  // config.ts exige estas env vars al importarse — mismo patrón que
  // cacheService.test.ts: seteo dummy + import dinámico DESPUÉS de setearlas.
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  ({ enrichWithAI, aiLookupProduct } = await import('./claudeService'));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockResponseText = '{}';
});

function setClaudeResponse(json: unknown): void {
  mockResponseText = JSON.stringify(json);
}

describe('enrichWithAI', () => {
  it('no llama a Claude si ya hay ingredientes y nutrientes clave', async () => {
    const off: RawOFFProduct = {
      product_name: 'Producto completo',
      ingredients_text: 'harina, agua, sal',
      nutriments: { 'energy-kcal_100g': 300, proteins_100g: 5, carbohydrates_100g: 40 },
    };
    const result = await enrichWithAI(off);
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(result).toBe(off);
  });

  // Gate de plausibilidad (nutrientPlausibility.ts) — el corazón de este
  // cambio: un valor que Claude alucina fuera de rango físico nunca se
  // guarda como si fuera un dato real, ni siquiera parcialmente.
  it('descarta un nutriente implausible que Claude propone, pero conserva los plausibles', async () => {
    setClaudeResponse({
      nutriments: { 'energy-kcal_100g': 4500, proteins_100g: 8, carbohydrates_100g: 40 },
    });
    const off: RawOFFProduct = {
      product_name: 'Producto sin nutrientes',
      brands: 'Marca',
      ingredients_text: 'harina, agua, sal, azúcar',
    };
    const result = await enrichWithAI(off);
    expect(result.nutriments?.['energy-kcal_100g']).toBeUndefined();
    expect(result.nutriments?.proteins_100g).toBe(8);
    expect(result.nutriments?.carbohydrates_100g).toBe(40);
  });

  it('no setea nutriments si TODOS los valores propuestos son implausibles', async () => {
    setClaudeResponse({ nutriments: { 'energy-kcal_100g': 4500, carbohydrates_100g: 817 } });
    const off: RawOFFProduct = {
      product_name: 'Producto raro',
      ingredients_text: 'harina, agua, sal, azúcar',
    };
    const result = await enrichWithAI(off);
    expect(result.nutriments).toBeUndefined();
  });

  it('acepta nutrientes dentro de rango normalmente', async () => {
    setClaudeResponse({ nutriments: { 'energy-kcal_100g': 450, proteins_100g: 8, carbohydrates_100g: 60 } });
    const off: RawOFFProduct = {
      product_name: 'Producto normal',
      ingredients_text: 'harina, agua, sal, azúcar',
    };
    const result = await enrichWithAI(off);
    expect(result.nutriments).toEqual({ 'energy-kcal_100g': 450, proteins_100g: 8, carbohydrates_100g: 60 });
  });

  it('completa ingredients_text cuando falta', async () => {
    setClaudeResponse({ ingredients_text: 'agua, sal' });
    const off: RawOFFProduct = {
      product_name: 'Producto sin ingredientes',
      nutriments: { 'energy-kcal_100g': 300, proteins_100g: 5, carbohydrates_100g: 40 },
    };
    const result = await enrichWithAI(off);
    expect(result.ingredients_text).toBe('agua, sal');
  });

  it('no crashea con JSON inválido de Claude — devuelve el producto sin tocar', async () => {
    mockResponseText = 'esto no es json';
    const off: RawOFFProduct = { product_name: 'X' };
    const result = await enrichWithAI(off);
    expect(result).toBe(off);
  });

  it('no llama a Claude si no hay product_name ni brands', async () => {
    const off: RawOFFProduct = {};
    const result = await enrichWithAI(off);
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(result).toBe(off);
  });
});

describe('aiLookupProduct', () => {
  it('descarta nutrientes implausibles igual que enrichWithAI', async () => {
    setClaudeResponse({
      product_name: 'Chimichurri Test',
      brands: 'Marca',
      nutriments: { 'energy-kcal_100g': 300, sodium_100g: 1200 },
    });
    const result = await aiLookupProduct('chimichurri test');
    expect(result?.nutriments?.sodium_100g).toBeUndefined();
    expect(result?.nutriments?.['energy-kcal_100g']).toBe(300);
  });

  it('devuelve null si Claude no reconoce el producto ({})', async () => {
    setClaudeResponse({});
    const result = await aiLookupProduct('producto inexistente xyz');
    expect(result).toBeNull();
  });
});
