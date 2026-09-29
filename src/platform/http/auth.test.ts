// requireAuth verifica el JWT localmente con el JWKS del proyecto (ADR-0008). El JWKS lo sirve
// un `fetch` falso con claves de test y `getUser` (solo con `checkSession`) se simula.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { generateKeyPair } from 'jose';
import { simularSupabaseAuth, SUPABASE_URL, type SupabaseAuthSimulado } from '../../testing/supabaseAuth';

const getUser = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser } })),
}));

let supabase: typeof import('@supabase/supabase-js');
let auth: SupabaseAuthSimulado;
let app: FastifyInstance;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const FALTA_TOKEN = { error: 'Falta el token de sesión', code: 'UNAUTHENTICATED' };
const SESION_INVALIDA = { error: 'Sesión inválida o expirada', code: 'UNAUTHENTICATED' };
const NO_DISPONIBLE = {
  error: 'El servicio no está disponible en este momento. Intentá de nuevo en un rato.',
  code: 'DEPENDENCY_UNAVAILABLE',
};

function sesionActiva(id = USER_ID) {
  getUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function errorDeAuth(message: string, status?: number, name = 'AuthApiError') {
  getUser.mockResolvedValue({ data: { user: null }, error: { name, message, status } });
}

/** App con el módulo de auth recién importado: su cache del JWKS arranca vacía. */
async function armarApp(): Promise<FastifyInstance> {
  vi.resetModules();
  const { requireAuth, optionalAuth } = await import('./auth');
  const { registerErrorHandling } = await import('./errors');

  // Mismo patrón que las rutas reales: cada módulo de rutas registra requireAuth en su contexto.
  const nueva = Fastify();
  registerErrorHandling(nueva); // como en producción (buildApp)
  await nueva.register(async (privado) => {
    await privado.register(requireAuth);
    privado.get('/privado', async (request) => ({ userId: request.userId }));
  });
  await nueva.register(async (sensible) => {
    await sensible.register(requireAuth, { checkSession: true });
    sensible.get('/sensible', async (request) => ({ userId: request.userId }));
  });
  await nueva.register(async (publico) => {
    publico.get('/publico', async () => ({ ok: true }));
    publico.get('/opcional', async (request) => ({ userId: await optionalAuth(request) }));
  });
  nueva.get('/health', async () => ({ ok: true }));
  await nueva.ready();
  return nueva;
}

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';

  auth = await simularSupabaseAuth();
  vi.stubGlobal('fetch', auth.fetch);
  app = await armarApp();
  supabase = await import('@supabase/supabase-js'); // el mismo que usa `app`
});

beforeEach(() => {
  getUser.mockReset();
  auth.jwks('ok');
});

afterEach(() => {
  vi.useRealTimers();
});

async function pedir(authorization?: string, url = '/privado', en = app) {
  return en.inject({
    method: 'GET',
    url,
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe('requireAuth — sin token (T-04)', () => {
  it('sin header Authorization → 401 y no consulta a Supabase', async () => {
    const res = await pedir();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(FALTA_TOKEN);
    expect(getUser).not.toHaveBeenCalled();
  });

  // H-02 (D-75): "Bearer" sin espacio ya no se manda como token.
  it.each(['Bearer ', 'Bearer    ', '', 'Bearer'])('header %j → 401 "Falta el token"', async (header) => {
    const res = await pedir(header);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(FALTA_TOKEN);
  });

  // H-02 (D-75): se exige `Bearer <token>`; un header sin el prefijo ya no se usa entero como token.
  it.each(['jwt-valido', 'Basic abc', 'Token xyz'])('header sin prefijo Bearer (%j) → 401', async (header) => {
    const res = await pedir(header);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(FALTA_TOKEN);
  });

  it('un JWT válido sin el prefijo Bearer → 401', async () => {
    const res = await pedir(await auth.token(USER_ID));
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(FALTA_TOKEN);
  });
});

describe('requireAuth — token rechazado (T-04)', () => {
  it('token mal formado → 401', async () => {
    const res = await pedir('Bearer no-es-un-jwt');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(SESION_INVALIDA);
  });

  it('firma inválida (otra clave con el mismo kid) → 401', async () => {
    const otra = await generateKeyPair('ES256');
    const res = await pedir(`Bearer ${await auth.token(USER_ID, {}, { clave: otra.privateKey })}`);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(SESION_INVALIDA);
  });

  it('token vencido → 401, con el mismo mensaje que el inválido', async () => {
    const ahora = Math.floor(Date.now() / 1000);
    const res = await pedir(`Bearer ${await auth.token(USER_ID, { iat: ahora - 7200, exp: ahora - 60 })}`);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(SESION_INVALIDA);
  });

  it.each([
    ['iss de otro proyecto', { iss: 'https://otro.supabase.co/auth/v1' }],
    ['iss sin /auth/v1', { iss: SUPABASE_URL }],
    ['aud distinto', { aud: 'anon' }],
    ['aud de service_role', { aud: 'service_role' }],
    ['sin exp', { exp: undefined }],
    ['sin sub', { sub: undefined }],
    ['sub vacío', { sub: '' }],
  ])('%s → 401', async (_caso, cambios) => {
    const res = await pedir(`Bearer ${await auth.token(USER_ID, cambios)}`);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(SESION_INVALIDA);
  });

  it('firmado con HS256 (secreto compartido) → 401', async () => {
    const secreto = new TextEncoder().encode('secreto-compartido-de-32-bytes!!');
    const res = await pedir(`Bearer ${await auth.token(USER_ID, {}, { clave: secreto, alg: 'HS256' })}`);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(SESION_INVALIDA);
  });

  it('kid que no está en el JWKS → 401', async () => {
    const res = await pedir(`Bearer ${await auth.token(USER_ID, {}, { kid: 'otra-clave' })}`);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(SESION_INVALIDA);
  });
});

describe('requireAuth — token aceptado (T-04)', () => {
  it('token válido → pasa y deja request.userId con el sub del token', async () => {
    const res = await pedir(`Bearer ${await auth.token(USER_ID)}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: USER_ID });
  });

  it('el prefijo Bearer no distingue mayúsculas y se recortan los espacios', async () => {
    const res = await pedir(`bearer   ${await auth.token(USER_ID)}  `);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: USER_ID });
  });

  it('verifica localmente: sin getUser y con el JWKS pedido una sola vez', async () => {
    const fresca = await armarApp();
    const antes = auth.pedidos;
    const token = `Bearer ${await auth.token(USER_ID)}`;
    for (let i = 0; i < 3; i++) expect((await pedir(token, '/privado', fresca)).statusCode).toBe(200);
    expect(auth.pedidos - antes).toBe(1);
    expect(getUser).not.toHaveBeenCalled();
    await fresca.close();
  });
});

describe('requireAuth — Supabase Auth caído (T-04, ADR-0006)', () => {
  // H-02: Auth caído ya no es "sesión inválida" (401): sin claves para verificar, 503.
  it.each(['caido', 'timeout', 'error-500', 'invalido'] as const)(
    'JWKS inaccesible en frío (%s) → 503 con retry-after',
    async (estado) => {
      auth.jwks(estado);
      const fresca = await armarApp();
      const res = await pedir(`Bearer ${await auth.token(USER_ID)}`, '/privado', fresca);
      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('10');
      expect(res.json()).toEqual(NO_DISPONIBLE);
      await fresca.close();
    },
  );

  it('con las claves en cache sigue funcionando aunque Auth esté caído', async () => {
    const token = `Bearer ${await auth.token(USER_ID)}`;
    expect((await pedir(token)).statusCode).toBe(200);
    auth.jwks('caido');
    expect((await pedir(token)).statusCode).toBe(200);
  });

  it('cache vencida (10 min) y Auth caído → sigue con las últimas claves', async () => {
    const fresca = await armarApp();
    expect((await pedir(`Bearer ${await auth.token(USER_ID)}`, '/privado', fresca)).statusCode).toBe(200);

    auth.jwks('caido');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 11 * 60_000);
    const antes = auth.pedidos;
    const res = await pedir(`Bearer ${await auth.token(USER_ID)}`, '/privado', fresca);
    expect(auth.pedidos).toBeGreaterThan(antes); // intentó refrescar
    expect(res.statusCode).toBe(200);
    await fresca.close();
  });

  it('con las claves en cache, un token inválido sigue siendo 401 aunque Auth esté caído', async () => {
    expect((await pedir(`Bearer ${await auth.token(USER_ID)}`)).statusCode).toBe(200);
    auth.jwks('caido');
    const otra = await generateKeyPair('ES256');
    const res = await pedir(`Bearer ${await auth.token(USER_ID, {}, { clave: otra.privateKey })}`);
    expect(res.statusCode).toBe(401);
  });

  it('kid nuevo y Auth caído → 503 (no se puede saber si la clave es válida)', async () => {
    const fresca = await armarApp();
    expect((await pedir(`Bearer ${await auth.token(USER_ID)}`, '/privado', fresca)).statusCode).toBe(200);
    auth.jwks('caido');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000); // pasado el cooldown de 30 s entre refrescos
    const res = await pedir(`Bearer ${await auth.token(USER_ID, {}, { kid: 'rotada' })}`, '/privado', fresca);
    expect(res.statusCode).toBe(503);
    await fresca.close();
  });
});

describe('requireAuth con checkSession — operaciones sensibles (T-04, ADR-0008)', () => {
  it('sesión activa → pasa; getUser recibe el token', async () => {
    sesionActiva();
    const token = await auth.token(USER_ID);
    const res = await pedir(`Bearer ${token}`, '/sensible');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: USER_ID });
    expect(getUser).toHaveBeenCalledWith(token);
  });

  it('usa un solo cliente Supabase, creado con la URL y la secret key del server', async () => {
    sesionActiva();
    await pedir(`Bearer ${await auth.token(USER_ID)}`, '/sensible');
    await pedir(`Bearer ${await auth.token(USER_ID)}`, '/sensible');
    expect(supabase.createClient).toHaveBeenCalledTimes(1);
    expect(supabase.createClient).toHaveBeenCalledWith(SUPABASE_URL, 'sb_secret_test', {
      global: { fetch: expect.any(Function) },
    });
  });

  it('JWT inválido → 401 sin consultar a Supabase', async () => {
    const res = await pedir('Bearer no-es-un-jwt', '/sensible');
    expect(res.statusCode).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['sesión revocada', 'Session from session_id claim in JWT does not exist', 403],
    ['usuario borrado', 'User from sub claim in JWT does not exist', 403],
    ['token rechazado', 'invalid JWT: unable to parse or verify signature', 401],
  ])('%s (JWT vigente, getUser responde 4xx) → 401', async (_caso, message, status) => {
    errorDeAuth(message, status);
    const res = await pedir(`Bearer ${await auth.token(USER_ID)}`, '/sensible');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(SESION_INVALIDA);
  });

  it('getUser devuelve otro usuario → 401', async () => {
    sesionActiva('22222222-2222-4222-8222-222222222222');
    const res = await pedir(`Bearer ${await auth.token(USER_ID)}`, '/sensible');
    expect(res.statusCode).toBe(401);
  });

  // H-02 (D-75): si getUser lanza ya no es 500, es Auth caído → 503.
  it('getUser lanza → 503', async () => {
    getUser.mockRejectedValue(new Error('boom'));
    const res = await pedir(`Bearer ${await auth.token(USER_ID)}`, '/sensible');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual(NO_DISPONIBLE);
  });

  // H-02: Auth que no responde ya no es "sesión inválida" (401), es 503.
  it.each([
    ['sin respuesta (red o timeout)', 0, 'AuthRetryableFetchError'],
    ['502', 502, 'AuthRetryableFetchError'],
    ['500', 500, 'AuthApiError'],
    ['respuesta que no es JSON', undefined, 'AuthUnknownError'],
  ])('Supabase Auth caído: %s → 503', async (_caso, status, name) => {
    errorDeAuth('fetch failed', status, name);
    const res = await pedir(`Bearer ${await auth.token(USER_ID)}`, '/sensible');
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBe('10');
    expect(res.json()).toEqual(NO_DISPONIBLE);
  });
});

describe('optionalAuth — sesión opcional (ADR-0006)', () => {
  it('token válido → el userId del token', async () => {
    const res = await pedir(`Bearer ${await auth.token(USER_ID)}`, '/opcional');
    expect(res.json()).toEqual({ userId: USER_ID });
  });

  it.each([
    ['sin header', undefined],
    ['header sin prefijo Bearer', 'jwt-valido'],
    ['"Bearer" sin token', 'Bearer'],
    ['token mal formado', 'Bearer no-es-un-jwt'],
  ])('%s → null, sin error', async (_caso, header) => {
    const res = await pedir(header, '/opcional');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: null });
  });

  it('token inválido o vencido → null, sin loguear error (caso normal)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ahora = Math.floor(Date.now() / 1000);
    const vencido = await auth.token(USER_ID, { iat: ahora - 7200, exp: ahora - 60 });
    const res = await pedir(`Bearer ${vencido}`, '/opcional');
    expect(res.json()).toEqual({ userId: null });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('Auth caído y sin claves → null (la request sigue anónima), no 503', async () => {
    auth.jwks('caido');
    const fresca = await armarApp();
    const res = await pedir(`Bearer ${await auth.token(USER_ID)}`, '/opcional', fresca);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: null });
    await fresca.close();
  });
});

describe('requireAuth — alcance del hook (T-04)', () => {
  it('una ruta de otro módulo no pasa por el hook', async () => {
    const res = await app.inject({ method: 'GET', url: '/publico' });
    expect(res.statusCode).toBe(200);
  });

  it('una ruta del root (/health) no pasa por el hook', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});
