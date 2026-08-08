import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock de Supabase ──
// Query builder encadenable donde todo devuelve `this` menos `.range()`, que
// resuelve la página. `pages` es la cola de respuestas: una por request, en
// orden. `rangesSeen` registra los rangos pedidos para poder afirmar que la
// paginación avanzó (y que cortó cuando tenía que cortar).
let pages: Record<string, unknown>[][] = [];
let pageError: { message: string } | null = null;
let rangesSeen: [number, number][] = [];

const builder = {
  select: vi.fn(() => builder),
  in: vi.fn(() => builder),
  not: vi.fn(() => builder),
  order: vi.fn(() => builder),
  range: vi.fn(async (from: number, to: number) => {
    rangesSeen.push([from, to]);
    if (pageError) return { data: null, error: pageError };
    return { data: pages.shift() ?? [], error: null };
  }),
};
const from = vi.fn(() => builder);

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

type StagingModule = typeof import('./staging');
let staging: StagingModule;

/** N filas de staging con barcodes distintos, para llenar una página. */
function rowsWithBarcodes(count: number, offset = 0): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({ barcode: String(offset + i) }));
}

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  staging = await import('./staging');
});

beforeEach(() => {
  vi.clearAllMocks();
  pages = [];
  pageError = null;
  rangesSeen = [];
});

describe('fetchPendingBarcodes', () => {
  it('pagina más allá del tope de 1000 filas de PostgREST', async () => {
    // 1000 (página llena → hay más) + 500 (página parcial → última).
    pages = [rowsWithBarcodes(1000), rowsWithBarcodes(500, 1000)];

    const result = await staging.fetchPendingBarcodes(5000);

    expect(result).toHaveLength(1500);
    expect(rangesSeen).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('no pide una segunda página cuando la primera vino incompleta', async () => {
    pages = [rowsWithBarcodes(300)];

    const result = await staging.fetchPendingBarcodes(5000);

    expect(result).toHaveLength(300);
    expect(rangesSeen).toEqual([[0, 999]]);
  });

  it('corta apenas junta `limit` barcodes distintos', async () => {
    pages = [rowsWithBarcodes(1000), rowsWithBarcodes(1000, 1000)];

    const result = await staging.fetchPendingBarcodes(10);

    expect(result).toHaveLength(10);
    expect(rangesSeen).toEqual([[0, 999]]); // no trajo la segunda página
  });

  it('deduplica barcodes repetidos entre páginas (varias fuentes, mismo producto)', async () => {
    // El mismo barcode en las dos páginas: cuenta una sola vez.
    pages = [
      Array.from({ length: 1000 }, () => ({ barcode: '7790895000218' })),
      [{ barcode: '7790895000218' }, { barcode: '7622300864934' }],
    ];

    const result = await staging.fetchPendingBarcodes(5000);

    expect(result).toEqual(['7790895000218', '7622300864934']);
  });

  it('devuelve lo juntado hasta el momento si una página falla', async () => {
    pageError = { message: 'boom' };

    const result = await staging.fetchPendingBarcodes(5000);

    expect(result).toEqual([]);
  });

  it('ordena por una columna estable para que la paginación no repita filas', async () => {
    pages = [rowsWithBarcodes(10)];

    await staging.fetchPendingBarcodes(5000);

    expect(builder.order).toHaveBeenCalledWith('id');
  });

  it('incluye los descartes previos solo cuando se pide (--enrich)', async () => {
    pages = [rowsWithBarcodes(1)];
    await staging.fetchPendingBarcodes(10, true);
    expect(builder.in).toHaveBeenCalledWith('merge_status', ['pending', 'discarded_incomplete']);

    vi.clearAllMocks();
    pages = [rowsWithBarcodes(1)];
    await staging.fetchPendingBarcodes(10, false);
    expect(builder.in).toHaveBeenCalledWith('merge_status', ['pending']);
  });
});

describe('fetchStagingStatusRows', () => {
  it('cuenta todas las filas, no solo las primeras 1000', async () => {
    pages = [
      Array.from({ length: 1000 }, () => ({ source: 'off', merge_status: 'merged' })),
      Array.from({ length: 200 }, () => ({ source: 'jumbo', merge_status: 'discarded_incomplete' })),
    ];

    const result = await staging.fetchStagingStatusRows();

    expect(result).toHaveLength(1200);
    expect(result.filter((r) => r.source === 'jumbo')).toHaveLength(200);
    expect(rangesSeen).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});
