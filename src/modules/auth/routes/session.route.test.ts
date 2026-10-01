// Sesión (F-03, RF-022/023/024/027) con la app base real: el mismo handler para todos los proveedores.
import { Writable } from 'node:stream';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { simularSupabaseAuth, SUPABASE_URL } from '../../../testing/supabaseAuth';
import type { Sessions } from '../application/session';
import { SESSION } from '../testing/fakes';

const sessions = {
  signIn: vi.fn<Sessions['signIn']>(),
  refresh: vi.fn<Sessions['refresh']>(),
  signOut: vi.fn<Sessions['signOut']>(),
};
let armar: (opts?: { logs?: string[] }) => Promise<FastifyInstance>;
let app: FastifyInstance | undefined;
let token: string;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IP = '127.0.0.1';
const VALIDATION = { error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' };
const LOGIN = { email: 'ana@mail.com', password: 'clave' };

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const auth = await simularSupabaseAuth();
  vi.stubGlobal('fetch', auth.fetch);
  token = await auth.token(USER);
  const { buildApp } = await import('../../../platform/http/buildApp');
  const { LOG_REDACT } = await import('../../../platform/logger');
  const { sessionRoutes } = await import('./session.route');
  armar = async (opts = {}) => {
    const stream = new Writable({
      write(chunk, _enc, done) {
        opts.logs?.push(String(chunk));
        done();
      },
    });
    const nueva = await buildApp(opts.logs ? { logger: { stream, redact: LOG_REDACT } } : {});
    await nueva.register(sessionRoutes({ sessions }));
    await nueva.ready();
    return nueva;
  };
});

beforeEach(async () => {
  vi.resetAllMocks();
  sessions.signIn.mockResolvedValue(SESSION);
  sessions.refresh.mockResolvedValue(SESSION);
  sessions.signOut.mockResolvedValue(undefined);
  app = await armar();
});

afterEach(async () => {
  await app?.close();
});

const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app!.inject({ method: 'POST', url, payload: payload as never, headers });

const PROVEEDORES = [
  ['/auth/login', LOGIN, { kind: 'password', email: 'ana@mail.com', password: 'clave' }, 'El email o la contraseña no son correctos.'],
  ['/auth/oauth/google', { idToken: 'tg' }, { kind: 'id_token', provider: 'google', idToken: 'tg' }, 'No pudimos verificar tu cuenta de Google. Intentá de nuevo.'],
  [
    '/auth/oauth/apple',
    { idToken: 'ta', nonce: 'n', firstName: 'Ana' },
    { kind: 'id_token', provider: 'apple', idToken: 'ta', nonce: 'n', names: { firstName: 'Ana', lastName: null } },
    'No pudimos verificar tu cuenta de Apple. Intentá de nuevo.',
  ],
] as const;

describe.each(PROVEEDORES)('POST %s', (url, body, credencial, invalido) => {
  it('200 Session, con la credencial de ese proveedor y la IP de la request', async () => {
    const res = await post(url, body);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SESSION);
    expect(sessions.signIn).toHaveBeenCalledWith(credencial, IP);
  });

  it('la IP sale de request.ip, nunca de un X-Forwarded-For que mande el cliente (D-30)', async () => {
    await post(url, body, { 'x-forwarded-for': '6.6.6.6' });
    expect(sessions.signIn).toHaveBeenCalledWith(expect.anything(), IP);
  });

  it('credenciales inválidas → 401 INVALID_CREDENTIALS con el mensaje del proveedor', async () => {
    sessions.signIn.mockResolvedValue('invalid_credentials');
    const res = await post(url, body);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: invalido, code: 'INVALID_CREDENTIALS' });
  });

  it('email sin confirmar → 403 EMAIL_NOT_CONFIRMED', async () => {
    sessions.signIn.mockResolvedValue('email_not_confirmed');
    const res = await post(url, body);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'EMAIL_NOT_CONFIRMED' });
  });

  it.each([
    ['límite de Supabase', 'rate_limited', '60'],
    ['demasiados intentos', { tooManyAttempts: 540 }, '540'],
  ] as const)('%s → 429 con retry-after', async (_c, resultado, retry) => {
    sessions.signIn.mockResolvedValue(resultado);
    const res = await post(url, body);
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe(retry);
  });

  it('Supabase caído → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    sessions.signIn.mockRejectedValue(new DependencyUnavailableError('auth', 'boom'));
    expect((await post(url, body)).statusCode).toBe(503);
  });

  it('campo de más → 400 sin llegar a Auth (D-70)', async () => {
    const res = await post(url, { ...body, provider: 'otro' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(sessions.signIn).not.toHaveBeenCalled();
  });

  it('la request 11 del minuto desde la misma IP → 429 (D-48)', async () => {
    for (let i = 0; i < 10; i++) expect((await post(url, body)).statusCode).not.toBe(429);
    expect((await post(url, body)).statusCode).toBe(429);
  });
});

describe('validaciones por proveedor', () => {
  it.each([
    ['/auth/login', { email: 'no-es-mail', password: 'x' }],
    ['/auth/login', { email: 'ana@mail.com', password: '' }],
    ['/auth/login', { email: 'ana@mail.com', password: 'x'.repeat(73) }],
    ['/auth/oauth/google', {}],
    ['/auth/oauth/google', { idToken: '' }],
    ['/auth/oauth/google', { idToken: 't', nonce: 'n' }],
    ['/auth/oauth/apple', { idToken: 't', firstName: '  ' }],
    ['/auth/oauth/apple', { idToken: 't', nonce: 'x'.repeat(129) }],
  ])('%s %j → 400', async (url, body) => {
    expect((await post(url, body)).statusCode).toBe(400);
    expect(sessions.signIn).not.toHaveBeenCalled();
  });

  it('login acepta contraseñas viejas de menos de 8', async () => {
    expect((await post('/auth/login', { email: 'ana@mail.com', password: '123456' })).statusCode).toBe(200);
  });

  it('Apple sin nombres: names con null', async () => {
    await post('/auth/oauth/apple', { idToken: 't' });
    expect(sessions.signIn).toHaveBeenCalledWith(
      { kind: 'id_token', provider: 'apple', idToken: 't', nonce: undefined, names: { firstName: null, lastName: null } },
      IP,
    );
  });
});

describe('POST /auth/refresh', () => {
  it('200 Session con la IP de la request', async () => {
    const res = await post('/auth/refresh', { refreshToken: 'r' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SESSION);
    expect(sessions.refresh).toHaveBeenCalledWith('r', IP);
  });

  it('refresh token inválido → 401 INVALID_REFRESH_TOKEN', async () => {
    sessions.refresh.mockResolvedValue('invalid_refresh_token');
    const res = await post('/auth/refresh', { refreshToken: 'r' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'La sesión expiró. Iniciá sesión de nuevo.', code: 'INVALID_REFRESH_TOKEN' });
  });

  it('límite de Supabase → 429', async () => {
    sessions.refresh.mockResolvedValue('rate_limited');
    expect((await post('/auth/refresh', { refreshToken: 'r' })).statusCode).toBe(429);
  });

  it.each([[{}], [{ refreshToken: '' }], [{ refreshToken: 'r', x: 1 }]])('%j → 400', async (body) => {
    expect((await post('/auth/refresh', body)).statusCode).toBe(400);
  });
});

describe('POST /auth/logout', () => {
  it('204 y revoca la sesión de ese token', async () => {
    const res = await post('/auth/logout', undefined, { authorization: `Bearer ${token}` });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(sessions.signOut).toHaveBeenCalledWith(token);
  });

  it.each([
    ['sin token', {}],
    ['token inválido', { authorization: 'Bearer basura' }],
  ])('%s → 401 sin llamar a Auth', async (_c, headers) => {
    const res = await post('/auth/logout', undefined, headers);
    expect(res.statusCode).toBe(401);
    expect(sessions.signOut).not.toHaveBeenCalled();
  });

  it('requireAuth vale solo para logout: login sigue sin token', async () => {
    expect((await post('/auth/login', LOGIN)).statusCode).toBe(200);
  });

  it('Supabase caído → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    sessions.signOut.mockRejectedValue(new DependencyUnavailableError('auth', 'boom'));
    expect((await post('/auth/logout', undefined, { authorization: `Bearer ${token}` })).statusCode).toBe(503);
  });
});

it('los logs no llevan email, contraseña, idToken, nonce ni tokens de sesión', async () => {
  await app?.close();
  const logs: string[] = [];
  app = await armar({ logs });
  await post('/auth/login', { email: 'secreta@mail.com', password: 'clave-secreta' });
  await post('/auth/oauth/apple', { idToken: 'id-token-secreto', nonce: 'nonce-secreto' });
  await post('/auth/refresh', { refreshToken: 'refresh-secreto' });
  sessions.signIn.mockResolvedValue('invalid_credentials');
  await post('/auth/login', { email: 'secreta@mail.com', password: 'clave-secreta' });
  await post('/auth/logout', undefined, { authorization: `Bearer ${token}` });
  const todo = logs.join('');
  expect(todo).toContain('/auth/login');
  for (const secreto of ['secreta@mail.com', 'clave-secreta', 'id-token-secreto', 'nonce-secreto', 'refresh-secreto', token, SESSION.accessToken + '"']) {
    expect(todo).not.toContain(secreto);
  }
});
