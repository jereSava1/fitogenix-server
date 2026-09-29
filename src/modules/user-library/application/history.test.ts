// Casos de uso con un repositorio falso; contra la base: supabaseHistoryRepository.test.ts.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HistoryRepository } from './ports';

// Importar catalog (para presentar las filas) carga platform/config, que exige
// estas variables: mismo patrón que el resto de los tests del repo.
let makeScanHistory: typeof import('./history').makeScanHistory;
beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ makeScanHistory } = await import('./history'));
});

function fakeRepo(rows: unknown[] = []): HistoryRepository {
  return {
    list: vi.fn(async () => rows),
    upsert: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
}

describe('makeScanHistory', () => {
  it('recordScan registra el escaneo con la hora actual', async () => {
    const repo = fakeRepo();
    const antes = Date.now();

    await makeScanHistory(repo).recordScan('user-1', 'uuid-galletitas');

    expect(repo.upsert).toHaveBeenCalledWith('user-1', 'uuid-galletitas', expect.any(Date));
    const at = vi.mocked(repo.upsert).mock.calls[0][2];
    expect(at.getTime()).toBeGreaterThanOrEqual(antes);
    expect(at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('removeFromHistory delega en el repositorio (RF-017)', async () => {
    const repo = fakeRepo();
    await makeScanHistory(repo).removeFromHistory('user-1', 'uuid-galletitas');
    expect(repo.remove).toHaveBeenCalledWith('user-1', 'uuid-galletitas');
  });

  it('listScanHistory pasa el límite y omite las filas sin producto', async () => {
    const repo = fakeRepo([
      {
        product_id: 'uuid-galletitas',
        scanned_at: '2026-07-14T12:00:00+00:00',
        products: { id: 'uuid-galletitas', product_name: 'Galletitas', ingredients_text: 'harina', data_source: 'off' },
      },
      { product_id: 'uuid-purgado', products: null },
    ]);

    const items = await makeScanHistory(repo).listScanHistory('user-1', 5);

    expect(repo.list).toHaveBeenCalledWith('user-1', 5);
    expect(items.map((p) => p.id)).toEqual(['uuid-galletitas']);
    expect(items[0].scannedAt).toBe('2026-07-14T12:00:00.000Z');
  });
});
