// El camino con Supabase simulado está en routes/lookup.dependencies.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { makeGetProduct } from './getProduct';
import type { CachedProductRow, ProductReader } from './ports';

const fila = (overrides: Partial<CachedProductRow> = {}): CachedProductRow => ({
  raw: { product_name: 'Yogur natural', ingredients_text: 'leche, fermentos lácticos' },
  dataSource: 'off',
  productId: 'uuid-yogur',
  barcode: '7790000000017',
  ...overrides,
});

function lector(row: CachedProductRow | null): ProductReader {
  return {
    findById: vi.fn(async () => row),
    findByBarcode: vi.fn(async () => null),
    findByName: vi.fn(async () => null),
  };
}

describe('makeGetProduct (K-04)', () => {
  it('busca por id y presenta el detalle con el uuid de la fila', async () => {
    const reader = lector(fila());
    const product = await makeGetProduct({ reader })('uuid-yogur');

    expect(reader.findById).toHaveBeenCalledWith('uuid-yogur');
    expect(product).toMatchObject({ id: 'uuid-yogur', name: 'Yogur natural' });
    expect(product?.ingredients.length).toBeGreaterThan(0);
  });

  it('no existe → null', async () => {
    await expect(makeGetProduct({ reader: lector(null) })('uuid-x')).resolves.toBeNull();
  });

  it('sin nombre: el barcode de la fila; sin barcode, el id', async () => {
    const sinNombre = { raw: { ingredients_text: 'agua' } };
    const conBarcode = await makeGetProduct({ reader: lector(fila(sinNombre)) })('uuid-yogur');
    expect(conBarcode?.name).toBe('7790000000017');

    const soloNombre = fila({ ...sinNombre, barcode: null });
    const sinBarcode = await makeGetProduct({ reader: lector(soloNombre) })('uuid-yogur');
    expect(sinBarcode?.name).toBe('uuid-yogur');
  });
});
