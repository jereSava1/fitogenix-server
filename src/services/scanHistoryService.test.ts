import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock de Supabase ──
// createClient devuelve un cliente cuyo query builder resuelve a lo que dejemos
// en los `*Result`. Cubre las tres formas que usa scanHistoryService:
//   .from().select().eq().order().limit()  → selectResult (GET historial)
//   .from().upsert()                       → upsertResult (recordScan)
//   .auth.getUser()                        → getUserResult (resolveUserIdFromToken)
type DbError = { message: string; code?: string } | null;
let selectResult: { data: unknown; error: DbError } = { data: null, error: null };
let upsertResult: { error: DbError } = { error: null };
let getUserResult: { data: { user: { id: string } | null }; error: DbError } = {
  data: { user: null },
  error: null,
};

const limitFn = vi.fn(async () => selectResult);
const order = vi.fn(() => ({ limit: limitFn }));
const selectEq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq: selectEq }));
const upsert = vi.fn(async (_payload: unknown, _options: unknown) => upsertResult);
const from = vi.fn(() => ({ select, upsert }));
const getUser = vi.fn(async () => getUserResult);

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from, auth: { getUser } })),
}));

type HistoryModule = typeof import('./scanHistoryService');
let history: HistoryModule;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  history = await import('./scanHistoryService');
});

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = { data: null, error: null };
  upsertResult = { error: null };
  getUserResult = { data: { user: null }, error: null };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Fila de `products` completa (con crudos) tal como la embebe PostgREST.
const galletitasRow = {
  cache_key: '7790001',
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
  cache_key: 'name:alfajor artesanal',
  product_name: 'Alfajor Artesanal',
  brand: '',
  ingredients_text: 'dulce de leche, harina',
  nutriments: { sugars_100g: 35 },
  data_source: 'ai',
  ai_enriched: true,
};

describe('recordScan', () => {
  it('upsert con onConflict user_id,cache_key SIN ignoreDuplicates (re-escanear actualiza scanned_at)', async () => {
    await expect(history.recordScan('user-1', '7790001')).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('scan_history');
    // Igualdad exacta del objeto de opciones: si apareciera ignoreDuplicates,
    // el conflicto dejaría scanned_at viejo y este assert fallaría.
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        cache_key: '7790001',
        scanned_at: expect.any(String),
      },
      { onConflict: 'user_id,cache_key' },
    );

    // scanned_at es un timestamp ISO válido.
    const payload = upsert.mock.calls[0][0] as unknown as { scanned_at: string };
    expect(Number.isNaN(Date.parse(payload.scanned_at))).toBe(false);
  });

  it('no lanza ante errores de DB: loguea y sigue (fire-and-forget)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    upsertResult = { error: { message: 'boom' } };

    await expect(history.recordScan('user-1', '7790001')).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });

  it('no lanza ante violación de FK (producto aún no cacheado, race del cold path)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    upsertResult = {
      error: {
        code: '23503',
        message: 'insert or update on table "scan_history" violates foreign key constraint',
      },
    };

    await expect(history.recordScan('user-1', 'name:nuevo')).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});

describe('resolveUserIdFromToken', () => {
  it('devuelve el userId con un token válido', async () => {
    getUserResult = { data: { user: { id: 'user-1' } }, error: null };

    await expect(history.resolveUserIdFromToken('jwt-valido')).resolves.toBe('user-1');
    expect(getUser).toHaveBeenCalledWith('jwt-valido');
  });

  it('devuelve null con token inválido/expirado, sin loguear error (caso normal)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getUserResult = { data: { user: null }, error: { message: 'invalid JWT' } };

    await expect(history.resolveUserIdFromToken('jwt-vencido')).resolves.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('listScanHistory', () => {
  it('mapea las filas embebidas a FitogenixProduct con cacheKey y dataSource', async () => {
    selectResult = {
      data: [
        { cache_key: '7790001', scanned_at: '2026-07-14T12:00:00Z', products: galletitasRow },
        {
          cache_key: 'name:alfajor artesanal',
          scanned_at: '2026-07-13T12:00:00Z',
          products: alfajorRow,
        },
      ],
      error: null,
    };

    const items = await history.listScanHistory('user-1', 20);

    expect(items).toHaveLength(2);
    // Preserva el orden del query (más reciente primero).
    expect(items[0].name).toBe('Galletitas');
    expect(items[0].cacheKey).toBe('7790001');
    expect(items[0].dataSource).toBe('off');
    expect(typeof items[0].score).toBe('number');
    expect(items[0].scoreLabel).toBeTruthy();
    expect(items[1].name).toBe('Alfajor Artesanal');
    expect(items[1].cacheKey).toBe('name:alfajor artesanal');
    expect(items[1].dataSource).toBe('ai');

    // Query correcto: embed de products + filtro por usuario + orden + límite.
    expect(from).toHaveBeenCalledWith('scan_history');
    expect(select).toHaveBeenCalledWith('cache_key, scanned_at, products(*)');
    expect(selectEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(order).toHaveBeenCalledWith('scanned_at', { ascending: false });
    expect(limitFn).toHaveBeenCalledWith(20);
  });

  it('respeta el límite pedido', async () => {
    selectResult = { data: [], error: null };
    await history.listScanHistory('user-1', 5);
    expect(limitFn).toHaveBeenCalledWith(5);
  });

  it('omite filas sin producto embebido y filas de products sin crudos', async () => {
    selectResult = {
      data: [
        { cache_key: '7790001', scanned_at: 'x', products: galletitasRow },
        // Producto embebido null (p.ej. fila purgada entre el join y la lectura).
        { cache_key: '999', scanned_at: 'x', products: null },
        // Fila vieja sin ingredients_text ni nutriments → rowToCachedRaw null.
        {
          cache_key: '888',
          scanned_at: 'x',
          products: { cache_key: '888', product_name: 'Viejo', data_source: 'off' },
        },
      ],
      error: null,
    };

    const items = await history.listScanHistory('user-1', 20);

    expect(items).toHaveLength(1);
    expect(items[0].cacheKey).toBe('7790001');
  });

  it('tolera el embed como array (forma to-many de PostgREST)', async () => {
    selectResult = {
      data: [{ cache_key: '7790001', scanned_at: 'x', products: [galletitasRow] }],
      error: null,
    };

    const items = await history.listScanHistory('user-1', 20);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Galletitas');
  });

  it('lista vacía cuando el usuario no tiene historial', async () => {
    selectResult = { data: [], error: null };
    await expect(history.listScanHistory('user-1', 20)).resolves.toEqual([]);
  });

  it('propaga errores de DB como Error (la ruta responde 500)', async () => {
    selectResult = { data: null, error: { message: 'boom' } };
    await expect(history.listScanHistory('user-1', 20)).rejects.toThrow('boom');
  });
});
