import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock de Supabase ──
// createClient devuelve un cliente cuyo query builder resuelve a lo que dejemos
// en los `*Result`. Cubre las tres formas que usa savedProductsService:
//   .from().select().eq().order()   → selectResult (GET)
//   .from().upsert()                → upsertResult (POST)
//   .from().delete().eq().eq()      → deleteResult (DELETE)
type DbError = { message: string; code?: string } | null;
let selectResult: { data: unknown; error: DbError } = { data: null, error: null };
let upsertResult: { error: DbError } = { error: null };
let deleteResult: { error: DbError } = { error: null };

const order = vi.fn(async () => selectResult);
const selectEq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq: selectEq }));
const upsert = vi.fn(async () => upsertResult);
const deleteEqProductId = vi.fn(async () => deleteResult);
const deleteEqUser = vi.fn(() => ({ eq: deleteEqProductId }));
const deleteFn = vi.fn(() => ({ eq: deleteEqUser }));
const from = vi.fn(() => ({ select, upsert, delete: deleteFn }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

type SavedModule = typeof import('./savedProductsService');
let saved: SavedModule;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  saved = await import('./savedProductsService');
});

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = { data: null, error: null };
  upsertResult = { error: null };
  deleteResult = { error: null };
});

// Fila de `products` completa (con id y crudos) tal como la embebe PostgREST.
const galletitasRow = {
  id: 'uuid-galletitas',
  barcode: '7790001',
  name_key: null,
  product_name: 'Galletitas',
  brand: 'Marca',
  category: 'Snacks',
  image_url: 'http://img',
  ingredients_text: 'harina, azucar',
  nutriments: { sugars_100g: 20 },
  nova_group: 4,
  additives_tags: ['en:e330'],
  data_source: 'off',
  ai_enriched: false,
};

const alfajorRow = {
  id: 'uuid-alfajor',
  barcode: null,
  name_key: 'alfajor artesanal',
  product_name: 'Alfajor Artesanal',
  brand: '',
  ingredients_text: 'dulce de leche, harina',
  nutriments: { sugars_100g: 35 },
  data_source: 'ai',
  ai_enriched: true,
};

describe('listSavedProducts', () => {
  it('mapea las filas embebidas a FitogenixProduct con productId y dataSource', async () => {
    selectResult = {
      data: [
        {
          product_id: 'uuid-galletitas',
          created_at: '2026-07-08T12:00:00Z',
          products: galletitasRow,
        },
        {
          product_id: 'uuid-alfajor',
          created_at: '2026-07-07T12:00:00Z',
          products: alfajorRow,
        },
      ],
      error: null,
    };

    const items = await saved.listSavedProducts('user-1');

    expect(items).toHaveLength(2);
    // Preserva el orden del query (más reciente primero).
    expect(items[0].name).toBe('Galletitas');
    expect(items[0].productId).toBe('uuid-galletitas');
    expect(items[0].dataSource).toBe('off');
    expect(typeof items[0].score).toBe('number');
    expect(items[0].scoreLabel).toBeTruthy();
    expect(items[1].name).toBe('Alfajor Artesanal');
    expect(items[1].productId).toBe('uuid-alfajor');
    expect(items[1].dataSource).toBe('ai');

    // Query correcto: embed de products + filtro por usuario + orden descendente.
    expect(from).toHaveBeenCalledWith('saved_products');
    expect(select).toHaveBeenCalledWith('product_id, created_at, products(*)');
    expect(selectEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('omite filas sin producto embebido y filas de products sin crudos', async () => {
    selectResult = {
      data: [
        { product_id: 'uuid-galletitas', created_at: 'x', products: galletitasRow },
        // Producto embebido null (p.ej. fila purgada entre el join y la lectura).
        { product_id: 'uuid-999', created_at: 'x', products: null },
        // Fila vieja sin ingredients_text ni nutriments → rowToCachedRaw null.
        {
          product_id: 'uuid-888',
          created_at: 'x',
          products: { id: 'uuid-888', product_name: 'Viejo', data_source: 'off' },
        },
      ],
      error: null,
    };

    const items = await saved.listSavedProducts('user-1');

    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe('uuid-galletitas');
  });

  it('tolera el embed como array (forma to-many de PostgREST)', async () => {
    selectResult = {
      data: [{ product_id: 'uuid-galletitas', created_at: 'x', products: [galletitasRow] }],
      error: null,
    };

    const items = await saved.listSavedProducts('user-1');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Galletitas');
  });

  it('lista vacía cuando el usuario no tiene guardados', async () => {
    selectResult = { data: [], error: null };
    await expect(saved.listSavedProducts('user-1')).resolves.toEqual([]);
  });

  it('propaga errores de DB como Error (la ruta responde 500)', async () => {
    selectResult = { data: null, error: { message: 'boom' } };
    await expect(saved.listSavedProducts('user-1')).rejects.toThrow('boom');
  });
});

describe('saveProduct', () => {
  it('upsert idempotente con onConflict user_id,product_id → ok', async () => {
    await expect(saved.saveProduct('user-1', 'uuid-galletitas')).resolves.toBe('ok');

    expect(from).toHaveBeenCalledWith('saved_products');
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', product_id: 'uuid-galletitas' },
      { onConflict: 'user_id,product_id', ignoreDuplicates: true },
    );
  });

  it('violación de FK (code 23503) → not_found (el producto no está en el catálogo)', async () => {
    upsertResult = {
      error: {
        code: '23503',
        message:
          'insert or update on table "saved_products" violates foreign key constraint',
      },
    };
    await expect(saved.saveProduct('user-1', 'uuid-inexistente')).resolves.toBe('not_found');
  });

  it('detecta 23503 también cuando solo viene en el mensaje', async () => {
    upsertResult = { error: { message: 'foreign key violation (SQLSTATE 23503)' } };
    await expect(saved.saveProduct('user-1', 'uuid-inexistente')).resolves.toBe('not_found');
  });

  it('otros errores de DB se propagan como Error', async () => {
    upsertResult = { error: { code: '42P01', message: 'relation does not exist' } };
    await expect(saved.saveProduct('user-1', 'uuid-galletitas')).rejects.toThrow(
      'relation does not exist',
    );
  });
});

describe('removeSavedProduct', () => {
  it('borra por user_id + product_id y es idempotente (sin error aunque no exista)', async () => {
    await expect(
      saved.removeSavedProduct('user-1', 'uuid-alfajor'),
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('saved_products');
    expect(deleteEqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(deleteEqProductId).toHaveBeenCalledWith('product_id', 'uuid-alfajor');
  });

  it('propaga errores de DB como Error', async () => {
    deleteResult = { error: { message: 'boom' } };
    await expect(saved.removeSavedProduct('user-1', 'uuid-galletitas')).rejects.toThrow('boom');
  });
});
