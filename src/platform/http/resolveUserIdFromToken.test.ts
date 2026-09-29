/* resolveUserIdFromToken (platform/http/auth.ts). Los dos casos se mudaron
 * sin cambios desde services/scanHistoryService.test.ts en M-06, junto con la
 * función. auth.test.ts (T-04, requireAuth) no se toca.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type DbError = { message: string; code?: string } | null;
let getUserResult: { data: { user: { id: string } | null }; error: DbError } = {
  data: { user: null },
  error: null,
};
const getUser = vi.fn(async () => getUserResult);

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser } })),
}));

let resolveUserIdFromToken: typeof import('./auth').resolveUserIdFromToken;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ resolveUserIdFromToken } = await import('./auth'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getUserResult = { data: { user: null }, error: null };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveUserIdFromToken', () => {
  it('devuelve el userId con un token válido', async () => {
    getUserResult = { data: { user: { id: 'user-1' } }, error: null };

    await expect(resolveUserIdFromToken('jwt-valido')).resolves.toBe('user-1');
    expect(getUser).toHaveBeenCalledWith('jwt-valido');
  });

  it('devuelve null con token inválido/expirado, sin loguear error (caso normal)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getUserResult = { data: { user: null }, error: { message: 'invalid JWT' } };

    await expect(resolveUserIdFromToken('jwt-vencido')).resolves.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
