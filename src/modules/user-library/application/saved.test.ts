// Casos de uso con un repositorio falso; contra la base: supabaseSavedRepository.test.ts.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SavedRepository } from './ports';

const filaValida = {
  product_id: 'uuid-galletitas',
  created_at: '2026-07-08T12:00:00+00:00',
  products: {
    id: 'uuid-galletitas',
    product_name: 'Galletitas',
    ingredients_text: 'harina, azucar',
    data_source: 'off',
  },
};

// Importar catalog (para presentar las filas) carga platform/config, que exige
// estas variables: mismo patrón que el resto de los tests del repo.
let makeSavedProducts: typeof import('./saved').makeSavedProducts;
beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ makeSavedProducts } = await import('./saved'));
});

function fakeRepo(rows: unknown[] = []): SavedRepository {
  return {
    list: vi.fn(async () => rows),
    add: vi.fn(async () => 'ok' as const),
    remove: vi.fn(async () => undefined),
  };
}

describe('makeSavedProducts', () => {
  it('listSavedProducts presenta cada fila con catalog y omite las que no sirven', async () => {
    const repo = fakeRepo([filaValida, { product_id: 'x', products: null }, 'basura']);

    const items = await makeSavedProducts(repo).listSavedProducts('user-1');

    expect(repo.list).toHaveBeenCalledWith('user-1');
    expect(items.map((p) => p.id)).toEqual(['uuid-galletitas']);
    expect(items[0].name).toBe('Galletitas');
    expect(items[0].savedAt).toBe('2026-07-08T12:00:00.000Z');
  });

  it('saveProduct y removeSavedProduct delegan en el repositorio', async () => {
    const repo = fakeRepo();
    vi.mocked(repo.add).mockResolvedValue('not_found');
    const saved = makeSavedProducts(repo);

    await expect(saved.saveProduct('user-1', 'uuid-x')).resolves.toBe('not_found');
    await saved.removeSavedProduct('user-1', 'uuid-x');

    expect(repo.add).toHaveBeenCalledWith('user-1', 'uuid-x');
    expect(repo.remove).toHaveBeenCalledWith('user-1', 'uuid-x');
  });

  it('un error del repositorio se propaga (la ruta responde 500)', async () => {
    const repo = fakeRepo();
    vi.mocked(repo.list).mockRejectedValue(new Error('saved_products select: boom'));

    await expect(makeSavedProducts(repo).listSavedProducts('user-1')).rejects.toThrow('boom');
  });
});
