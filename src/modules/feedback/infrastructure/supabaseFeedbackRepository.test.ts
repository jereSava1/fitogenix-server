// Contra la base (simulada): tabla, columnas y traducción de errores.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackRepository } from '../application/ports';

type DbError = { message: string; code?: string } | null;
let insertResult: { error: DbError } = { error: null };

const insert = vi.fn(async (_row: unknown) => insertResult);
const from = vi.fn(() => ({ insert }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

let repo: FeedbackRepository;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ supabaseFeedbackRepository: repo } = await import('./supabaseFeedbackRepository'));
});

beforeEach(() => {
  vi.clearAllMocks();
  insertResult = { error: null };
});

const PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ENTRADA = { userId: 'u1', message: 'Hola', appVersion: '1.2.0', platform: 'ios' as const };
const REPORTE = { userId: null, productId: PRODUCT_ID, type: 'score' as const, message: null };

describe('saveFeedback', () => {
  it('inserta en feedback con las columnas en snake_case', async () => {
    await repo.saveFeedback(ENTRADA);
    expect(from).toHaveBeenCalledWith('feedback');
    expect(insert).toHaveBeenCalledWith({ user_id: 'u1', message: 'Hola', app_version: '1.2.0', platform: 'ios' });
  });

  it('un error de la base o una excepción → DependencyUnavailableError (503)', async () => {
    insertResult = { error: { message: 'boom' } };
    await expect(repo.saveFeedback(ENTRADA)).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
    insert.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(repo.saveFeedback(ENTRADA)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
  });
});

describe('saveReport', () => {
  it('inserta en product_reports y responde ok', async () => {
    await expect(repo.saveReport(REPORTE)).resolves.toBe('ok');
    expect(from).toHaveBeenCalledWith('product_reports');
    expect(insert).toHaveBeenCalledWith({ user_id: null, product_id: PRODUCT_ID, type: 'score', message: null });
  });

  it('el producto no existe (FK, 23503) → product_not_found', async () => {
    insertResult = { error: { code: '23503', message: 'violates foreign key constraint' } };
    await expect(repo.saveReport(REPORTE)).resolves.toBe('product_not_found');
  });

  it('otro error de la base o una excepción → DependencyUnavailableError (503)', async () => {
    insertResult = { error: { code: '23514', message: 'check constraint' } };
    await expect(repo.saveReport(REPORTE)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
    insert.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(repo.saveReport(REPORTE)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
  });
});
