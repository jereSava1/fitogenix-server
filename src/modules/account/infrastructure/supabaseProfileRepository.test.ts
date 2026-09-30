// Contra la base (simulada): filtros, mapeo de columnas y traducción de errores.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileRepository } from '../application/ports';

type DbError = { message: string; code?: string } | null;
let selectResult: { data: unknown; error: DbError } = { data: null, error: null };
let updateResult: { data: unknown; error: DbError } = { data: null, error: null };

const selectMaybeSingle = vi.fn(async () => selectResult);
const selectEq = vi.fn(() => ({ maybeSingle: selectMaybeSingle }));
const retry = vi.fn(() => ({ eq: selectEq }));
const select = vi.fn(() => ({ retry }));
const updateMaybeSingle = vi.fn(async () => updateResult);
const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
const updateEq = vi.fn(() => ({ select: updateSelect }));
const update = vi.fn((_row: unknown) => ({ eq: updateEq }));
const from = vi.fn(() => ({ select, update }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

let repo: ProfileRepository;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ supabaseProfileRepository: repo } = await import('./supabaseProfileRepository'));
});

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = { data: null, error: null };
  updateResult = { data: null, error: null };
});

const FILA = { first_name: 'Ana', last_name: 'Pérez', username: 'ana.p', phone: '+5491123456789' };
const PERFIL = { firstName: 'Ana', lastName: 'Pérez', username: 'ana.p', phone: '+5491123456789' };
const COLUMNAS = 'first_name, last_name, username, phone';

describe('get', () => {
  it('lee la fila del usuario, sin reintentos, y la pasa a camelCase', async () => {
    selectResult = { data: FILA, error: null };
    await expect(repo.get('user-1')).resolves.toEqual(PERFIL);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith(COLUMNAS);
    expect(retry).toHaveBeenCalledWith(false);
    expect(selectEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('sin fila → null', async () => {
    await expect(repo.get('user-1')).resolves.toBeNull();
  });

  it('un error de la base o una excepción → DependencyUnavailableError (503)', async () => {
    selectResult = { data: null, error: { message: 'boom' } };
    await expect(repo.get('user-1')).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
    selectMaybeSingle.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(repo.get('user-1')).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
  });
});

describe('update', () => {
  it('cambia solo los campos que vienen, en la fila del usuario', async () => {
    updateResult = { data: { ...FILA, first_name: 'Anita' }, error: null };
    await expect(repo.update('user-1', { firstName: 'Anita' })).resolves.toEqual({ ...PERFIL, firstName: 'Anita' });
    expect(update).toHaveBeenCalledWith({ first_name: 'Anita' });
    expect(updateEq).toHaveBeenCalledWith('id', 'user-1');
    expect(updateSelect).toHaveBeenCalledWith(COLUMNAS);
  });

  it('mapea los cuatro campos a sus columnas', async () => {
    updateResult = { data: FILA, error: null };
    await repo.update('user-1', PERFIL as Record<string, string>);
    expect(update).toHaveBeenCalledWith(FILA);
  });

  it('username repetido (23505) → username_taken', async () => {
    updateResult = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    await expect(repo.update('user-1', { username: 'tomado' })).resolves.toBe('username_taken');
  });

  it('sin fila → not_found', async () => {
    await expect(repo.update('user-1', { firstName: 'Ana' })).resolves.toBe('not_found');
  });

  it('otro error de la base o una excepción → DependencyUnavailableError (503)', async () => {
    updateResult = { data: null, error: { code: '42P01', message: 'boom' } };
    await expect(repo.update('user-1', { firstName: 'Ana' })).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
    updateMaybeSingle.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(repo.update('user-1', { firstName: 'Ana' })).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
  });
});
