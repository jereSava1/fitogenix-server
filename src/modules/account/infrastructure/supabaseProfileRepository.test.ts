// Contra la base (simulada): filtros, mapeo de columnas y traducción de errores.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileRepository } from '../application/ports';

type DbError = { message: string; code?: string } | null;
let selectResult: { data: unknown; error: DbError } = { data: null, error: null };
let updateResult: { data: unknown; error: DbError } = { data: null, error: null };

const selectMaybeSingle = vi.fn(async () => selectResult);
const selectEq = vi.fn(() => ({ maybeSingle: selectMaybeSingle }));
let usernameResult: { data: unknown; error: DbError } = { data: [], error: null };
const limit = vi.fn(async () => usernameResult);
const ilike = vi.fn(() => ({ limit }));
const retry = vi.fn(() => ({ eq: selectEq, ilike }));
const select = vi.fn(() => ({ retry }));
const updateMaybeSingle = vi.fn(async () => updateResult);
const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
const updateEq = vi.fn(() => ({ select: updateSelect }));
const update = vi.fn((_row: unknown) => ({ eq: updateEq }));
let upsertResult: { error: DbError } = { error: null };
const upsert = vi.fn(async (_row: unknown, _opts: unknown) => upsertResult);
const from = vi.fn(() => ({ select, update, upsert }));

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
  usernameResult = { data: [], error: null };
  upsertResult = { error: null };
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

describe('isUsernameTaken', () => {
  it('busca sin distinguir mayúsculas y con el _ como literal (en LIKE es comodín)', async () => {
    await expect(repo.isUsernameTaken('ana_p')).resolves.toBe(false);
    expect(select).toHaveBeenCalledWith('id');
    expect(retry).toHaveBeenCalledWith(false);
    expect(ilike).toHaveBeenCalledWith('username', 'ana\\_p');
    expect(limit).toHaveBeenCalledWith(1);

    usernameResult = { data: [{ id: 'otro' }], error: null };
    await expect(repo.isUsernameTaken('ana.p')).resolves.toBe(true);
    expect(ilike).toHaveBeenLastCalledWith('username', 'ana.p');
  });

  it('un error de la base → DependencyUnavailableError (503)', async () => {
    usernameResult = { data: null, error: { message: 'boom' } };
    await expect(repo.isUsernameTaken('ana')).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
  });
});

describe('create', () => {
  const NUEVO = { firstName: 'Ana', lastName: 'Pérez', username: 'ana.p', phone: '+5491123456789' };

  it('sin fila: la crea con los cuatro campos', async () => {
    await expect(repo.create('user-1', NUEVO)).resolves.toBe('created');
    expect(selectEq).toHaveBeenCalledWith('id', 'user-1');
    expect(upsert).toHaveBeenCalledWith({ id: 'user-1', ...FILA }, { onConflict: 'id' });
  });

  it('fila sin username (la del trigger o un registro que no terminó): la completa', async () => {
    selectResult = { data: { username: null }, error: null };
    await expect(repo.create('user-1', NUEVO)).resolves.toBe('created');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('fila con username (se registró antes y no confirmó): no la toca', async () => {
    selectResult = { data: { username: 'ana.vieja' }, error: null };
    await expect(repo.create('user-1', NUEVO)).resolves.toBe('exists');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('username repetido (23505) → username_taken', async () => {
    upsertResult = { error: { code: '23505', message: 'duplicate key' } };
    await expect(repo.create('user-1', NUEVO)).resolves.toBe('username_taken');
  });

  it('otro error al leer o al escribir → DependencyUnavailableError (503)', async () => {
    selectResult = { data: null, error: { message: 'boom' } };
    await expect(repo.create('user-1', NUEVO)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
    selectResult = { data: null, error: null };
    upsertResult = { error: { code: '42501', message: 'permission denied' } };
    await expect(repo.create('user-1', NUEVO)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
    upsert.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(repo.create('user-1', NUEVO)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
  });
});

describe('ensure (primer inicio de sesión con un proveedor)', () => {
  const NOMBRES = { firstName: 'Ana', lastName: 'Pérez' };

  it('sin fila: la crea con los nombres', async () => {
    await repo.ensure('user-1', NOMBRES);
    expect(selectEq).toHaveBeenCalledWith('id', 'user-1');
    expect(upsert).toHaveBeenCalledWith({ id: 'user-1', first_name: 'Ana', last_name: 'Pérez' }, { onConflict: 'id' });
  });

  it('fila vacía (la del trigger): la completa', async () => {
    selectResult = { data: { first_name: null, last_name: null, username: null, phone: null }, error: null };
    await repo.ensure('user-1', NOMBRES);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['nombre', { first_name: 'Otra' }],
    ['username', { username: 'ana.p' }],
    ['teléfono', { phone: '+5491123456789' }],
  ])('fila con algún dato (%s): no la toca', async (_c, dato) => {
    selectResult = { data: { first_name: null, last_name: null, username: null, phone: null, ...dato }, error: null };
    await repo.ensure('user-1', NOMBRES);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('un error al leer o al escribir → DependencyUnavailableError (503)', async () => {
    selectResult = { data: null, error: { message: 'boom' } };
    await expect(repo.ensure('user-1', NOMBRES)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
    selectResult = { data: null, error: null };
    upsertResult = { error: { code: '23503', message: 'fk' } };
    await expect(repo.ensure('user-1', NOMBRES)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
  });
});
