// requireAuth valida con `getUser(token)` en cada request (H-02 lo pasa a JWT local).
// Supabase se simula.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const getUser = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser } })),
}));

let supabase: typeof import('@supabase/supabase-js');
let app: FastifyInstance;

const USER_ID = '11111111-1111-4111-8111-111111111111';

function usuarioValido() {
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
}

function errorDeAuth(message: string, status?: number) {
  getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError', message, status } });
}

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';

  supabase = await import('@supabase/supabase-js');
  const { requireAuth } = await import('./auth');

  // Mismo patrón que las rutas reales (saved.ts, history.ts, deleteMe.ts):
  // cada módulo de rutas registra requireAuth dentro de su propio contexto.
  app = Fastify();
  await app.register(async (privado) => {
    await privado.register(requireAuth);
    privado.get('/privado', async (request) => ({ userId: request.userId }));
  });
  await app.register(async (publico) => {
    publico.get('/publico', async () => ({ ok: true }));
  });
  app.get('/health', async () => ({ ok: true }));
  await app.ready();
});

beforeEach(() => {
  getUser.mockReset();
});

async function pedir(authorization?: string) {
  return app.inject({
    method: 'GET',
    url: '/privado',
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe('requireAuth — sin token (T-04)', () => {
  it('sin header Authorization → 401 y no consulta a Supabase', async () => {
    const res = await pedir();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Falta el token de sesión', code: 'UNAUTHENTICATED' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each(['Bearer ', 'Bearer    ', ''])('header %j → 401 sin consultar a Supabase', async (header) => {
    const res = await pedir(header);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Falta el token de sesión', code: 'UNAUTHENTICATED' });
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe('requireAuth — token rechazado (T-04)', () => {
  it('token inválido → 401', async () => {
    errorDeAuth('invalid JWT: unable to parse or verify signature', 403);
    const res = await pedir('Bearer no-es-un-jwt');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' });
    expect(getUser).toHaveBeenCalledWith('no-es-un-jwt');
  });

  it('token vencido → 401, con el mismo mensaje que el inválido', async () => {
    errorDeAuth('invalid JWT: token is expired', 403);
    const res = await pedir('Bearer jwt-vencido');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' });
  });

  it('Supabase responde sin usuario y sin error → 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await pedir('Bearer jwt');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' });
  });

  // CARACTERIZA: cambia en H-02. Una caída de Supabase Auth responde 401, no 503.
  it('Supabase Auth caído (error de red) → 401', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 },
    });
    const res = await pedir('Bearer jwt-valido');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' });
  });

  // CARACTERIZA: cambia en H-02. Si getUser lanza, el hook no lo atrapa: 500.
  it('getUser lanza → 500', async () => {
    getUser.mockRejectedValue(new Error('boom'));
    const res = await pedir('Bearer jwt');
    expect(res.statusCode).toBe(500);
  });

  // CARACTERIZA: cambia en H-02. "Bearer" sin espacio se manda como token en vez de
  // cortar con "Falta el token".
  it('header "Bearer" sin espacio → se manda "Bearer" a Supabase como token', async () => {
    errorDeAuth('invalid JWT: unable to parse or verify signature', 403);
    const res = await pedir('Bearer');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' });
    expect(getUser).toHaveBeenCalledWith('Bearer');
  });
});

describe('requireAuth — token aceptado (T-04)', () => {
  it('token válido → pasa y deja request.userId con el id del usuario de Supabase', async () => {
    usuarioValido();
    const res = await pedir('Bearer jwt-valido');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: USER_ID });
    expect(getUser).toHaveBeenCalledWith('jwt-valido');
  });

  it('el prefijo Bearer no distingue mayúsculas y se recortan los espacios', async () => {
    usuarioValido();
    const res = await pedir('bearer   jwt-valido  ');
    expect(res.statusCode).toBe(200);
    expect(getUser).toHaveBeenCalledWith('jwt-valido');
  });

  // CARACTERIZA: cambia en H-02. Sin prefijo Bearer, el header entero es el token.
  it('header sin prefijo Bearer → se usa el header entero como token', async () => {
    usuarioValido();
    const res = await pedir('jwt-valido');
    expect(res.statusCode).toBe(200);
    expect(getUser).toHaveBeenCalledWith('jwt-valido');
  });

  it('valida cada request contra Supabase (sin cache de sesiones)', async () => {
    usuarioValido();
    await pedir('Bearer jwt-valido');
    await pedir('Bearer jwt-valido');
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('usa un solo cliente Supabase, creado con la URL y la secret key del server', async () => {
    usuarioValido();
    await pedir('Bearer jwt-valido');
    expect(supabase.createClient).toHaveBeenCalledTimes(1);
    expect(supabase.createClient).toHaveBeenCalledWith('https://test.supabase.co', 'sb_secret_test');
  });
});

describe('requireAuth — alcance del hook (T-04)', () => {
  it('una ruta de otro módulo no pasa por el hook', async () => {
    const res = await app.inject({ method: 'GET', url: '/publico' });
    expect(res.statusCode).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('una ruta del root (/health) no pasa por el hook', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });
});
