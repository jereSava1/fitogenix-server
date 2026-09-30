// Registro y username libre (F-02, RF-020/021) con la app base real (errores, rate limit, logs).
import { Writable } from 'node:stream';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { SignUp } from '../application/signUp';

const signUp = {
  signUp: vi.fn<SignUp['signUp']>(),
  isUsernameAvailable: vi.fn<SignUp['isUsernameAvailable']>(),
};
let armar: (opts?: { logs?: string[] }) => Promise<FastifyInstance>;
let app: FastifyInstance | undefined;

const VALIDATION = { error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' };
const PERFIL = { firstName: 'Ana', lastName: 'Pérez', username: 'ana.p', phone: '+5491123456789' };
const BODY = { email: 'ana@mail.com', password: 'clave-segura', ...PERFIL };

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  const { buildApp, LOG_REDACT } = await import('../../../platform/http/buildApp');
  const { signUpRoutes } = await import('./signup.route');
  armar = async (opts = {}) => {
    const stream = new Writable({
      write(chunk, _enc, done) {
        opts.logs?.push(String(chunk));
        done();
      },
    });
    const nueva = await buildApp(opts.logs ? { logger: { stream, redact: LOG_REDACT } } : {});
    await nueva.register(signUpRoutes({ signUp }));
    await nueva.ready();
    return nueva;
  };
});

beforeEach(async () => {
  vi.resetAllMocks();
  signUp.signUp.mockResolvedValue('confirmation_required');
  signUp.isUsernameAvailable.mockResolvedValue(true);
  app = await armar();
});

afterEach(async () => {
  await app?.close();
});

const registrar = (payload: unknown) => app!.inject({ method: 'POST', url: '/auth/signup', payload: payload as never });
const disponible = (query: string) => app!.inject({ method: 'GET', url: `/auth/username-availability${query}` });

describe('POST /auth/signup', () => {
  it('201 { status: confirmation_required }, con el perfil aparte de las credenciales', async () => {
    const res = await registrar(BODY);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ status: 'confirmation_required' });
    expect(signUp.signUp).toHaveBeenCalledWith('ana@mail.com', 'clave-segura', PERFIL, '127.0.0.1');
  });

  it.each([
    ['email_taken', 409, { error: 'Ya hay una cuenta con ese email.', code: 'EMAIL_TAKEN' }],
    ['username_taken', 409, { error: 'Ese nombre de usuario ya está en uso.', code: 'USERNAME_TAKEN' }],
    ['weak_password', 400, { error: 'La contraseña no cumple los requisitos de seguridad.', code: 'VALIDATION_ERROR' }],
    ['rejected', 400, { error: 'No se pudo crear la cuenta con esos datos.', code: 'VALIDATION_ERROR' }],
  ] as const)('%s → %i', async (motivo, status, body) => {
    signUp.signUp.mockResolvedValue(motivo);
    const res = await registrar(BODY);
    expect(res.statusCode).toBe(status);
    expect(res.json()).toEqual(body);
  });

  it('Supabase limita los registros → 429 con retry-after', async () => {
    signUp.signUp.mockResolvedValue('rate_limited');
    const res = await registrar(BODY);
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('Supabase caído → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    signUp.signUp.mockRejectedValue(new DependencyUnavailableError('auth', 'boom'));
    const res = await registrar(BODY);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });

  it.each([
    ['sin body', undefined],
    ['email inválido', { ...BODY, email: 'no-es-un-mail' }],
    ['contraseña de 7', { ...BODY, password: '1234567' }],
    ['contraseña de 73', { ...BODY, password: 'x'.repeat(73) }],
    ['sin nombre', { ...BODY, firstName: undefined }],
    ['nombre en blanco', { ...BODY, firstName: '   ' }],
    ['apellido de 61', { ...BODY, lastName: 'x'.repeat(61) }],
    ['username con mayúsculas', { ...BODY, username: 'Ana.P' }],
    ['username de 2', { ...BODY, username: 'ab' }],
    ['username con espacios', { ...BODY, username: 'ana p' }],
    ['teléfono sin +', { ...BODY, phone: '5491123456789' }],
    ['sin teléfono', { ...BODY, phone: undefined }],
    ['metadata de más (D-46, D-70)', { ...BODY, data: { role: 'admin' } }],
  ])('%s → 400 sin llegar a Auth', async (_caso, body) => {
    const res = await registrar(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(signUp.signUp).not.toHaveBeenCalled();
  });
});

describe('GET /auth/username-availability', () => {
  it.each([true, false])('200 { available: %s }', async (libre) => {
    signUp.isUsernameAvailable.mockResolvedValue(libre);
    const res = await disponible('?username=ana_p');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: libre });
    expect(signUp.isUsernameAvailable).toHaveBeenCalledWith('ana_p');
  });

  it.each([
    ['sin username', ''],
    ['con mayúsculas', '?username=Ana'],
    ['de 31', `?username=${'a'.repeat(31)}`],
    ['con comodines de LIKE', '?username=an%25'],
    ['parámetro de más (D-70)', '?username=ana&x=1'],
  ])('%s → 400', async (_caso, query) => {
    const res = await disponible(query);
    expect(res.statusCode).toBe(400);
    expect(signUp.isUsernameAvailable).not.toHaveBeenCalled();
  });

  it('la base caída → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    signUp.isUsernameAvailable.mockRejectedValue(new DependencyUnavailableError('supabase', 'boom'));
    expect((await disponible('?username=ana')).statusCode).toBe(503);
  });
});

describe('/auth/signup y username-availability — límites y logs (D-48)', () => {
  it.each(['signup', 'username-availability'] as const)('%s: la request 11 del minuto desde la misma IP → 429', async (ruta) => {
    const pedir = () => (ruta === 'signup' ? registrar(BODY) : disponible('?username=ana'));
    for (let i = 0; i < 10; i++) expect((await pedir()).statusCode).not.toBe(429);
    const res = await pedir();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('los logs no llevan el email, la contraseña ni el teléfono, ni cuando falla', async () => {
    await app?.close();
    const logs: string[] = [];
    app = await armar({ logs });
    signUp.signUp.mockResolvedValue('email_taken');
    await registrar({ ...BODY, email: 'secreta@mail.com', password: 'clave-secreta', phone: '+5491199998888' });
    await registrar({ ...BODY, email: 'secreta@mail.com', password: 'clave-secreta', phone: '5491199998888' });
    const todo = logs.join('');
    expect(todo).toContain('/auth/signup');
    for (const secreto of ['secreta@mail.com', 'clave-secreta', '91199998888']) expect(todo).not.toContain(secreto);
  });
});
