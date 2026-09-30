// Recuperar la contraseña (F-04, RF-025) con la app base real (errores, rate limit, logs).
import { Writable } from 'node:stream';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PasswordReset } from '../application/resetPassword';

const passwordReset = {
  forgot: vi.fn<PasswordReset['forgot']>(),
  reset: vi.fn<PasswordReset['reset']>(),
};
let armar: (opts?: { logs?: string[] }) => Promise<FastifyInstance>;
let app: FastifyInstance | undefined;

const VALIDATION = { error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' };
const BODY = { email: 'ana@mail.com', code: '123456', newPassword: 'nueva-clave' };

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  const { buildApp, LOG_REDACT } = await import('../../../platform/http/buildApp');
  const { passwordRoutes } = await import('./password.route');
  armar = async (opts = {}) => {
    const stream = new Writable({
      write(chunk, _enc, done) {
        opts.logs?.push(String(chunk));
        done();
      },
    });
    const nueva = await buildApp(opts.logs ? { logger: { stream, redact: LOG_REDACT } } : {});
    await nueva.register(passwordRoutes({ passwordReset }));
    await nueva.ready();
    return nueva;
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  passwordReset.forgot.mockResolvedValue(undefined);
  passwordReset.reset.mockResolvedValue('ok');
  app = await armar();
});

afterEach(async () => {
  await app?.close();
});

const forgot = (payload: unknown) => app!.inject({ method: 'POST', url: '/auth/password/forgot', payload: payload as never });
const reset = (payload: unknown) => app!.inject({ method: 'POST', url: '/auth/password/reset', payload: payload as never });

describe('POST /auth/password/forgot', () => {
  it('202 { ok: true } y pide el código', async () => {
    const res = await forgot({ email: 'ana@mail.com' });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(passwordReset.forgot).toHaveBeenCalledWith('ana@mail.com');
  });

  it.each([
    ['sin body', undefined],
    ['sin email', {}],
    ['email inválido', { email: 'no-es-un-mail' }],
    ['campo de más (D-70)', { email: 'ana@mail.com', redirectTo: 'https://evil.test' }],
  ])('%s → 400 sin pedir nada', async (_caso, body) => {
    const res = await forgot(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(passwordReset.forgot).not.toHaveBeenCalled();
  });

  it('Supabase Auth caído → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    passwordReset.forgot.mockRejectedValue(new DependencyUnavailableError('auth', 'boom'));
    const res = await forgot({ email: 'ana@mail.com' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
});

describe('POST /auth/password/reset', () => {
  it('200 { ok: true } con el código correcto', async () => {
    const res = await reset(BODY);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(passwordReset.reset).toHaveBeenCalledWith('ana@mail.com', '123456', 'nueva-clave');
  });

  it('código inválido o vencido → 401 INVALID_CODE', async () => {
    passwordReset.reset.mockResolvedValue('invalid_code');
    const res = await reset(BODY);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'El código es inválido o expiró. Pedí uno nuevo.', code: 'INVALID_CODE' });
  });

  it.each([
    ['same_password', 'La contraseña nueva tiene que ser distinta de la anterior.'],
    ['weak_password', 'La contraseña no cumple los requisitos de seguridad.'],
  ] as const)('Auth rechaza la contraseña (%s) → 400 con el motivo', async (motivo, mensaje) => {
    passwordReset.reset.mockResolvedValue(motivo);
    const res = await reset(BODY);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: mensaje, code: 'VALIDATION_ERROR' });
  });

  it('demasiados códigos fallidos para ese email → 429 con retry-after', async () => {
    passwordReset.reset.mockResolvedValue({ tooManyAttempts: 540 });
    const res = await reset(BODY);
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('540');
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('Supabase limita las verificaciones → 429', async () => {
    passwordReset.reset.mockResolvedValue('rate_limited');
    const res = await reset(BODY);
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
  });

  it.each([
    ['código con letras', { ...BODY, code: '12ab56' }],
    ['código de 5 dígitos', { ...BODY, code: '12345' }],
    ['código de 11 dígitos', { ...BODY, code: '12345678901' }],
    ['contraseña de 7', { ...BODY, newPassword: '1234567' }],
    ['contraseña de 73', { ...BODY, newPassword: 'x'.repeat(73) }],
    ['sin email', { code: '123456', newPassword: 'nueva-clave' }],
    ['campo de más (D-70)', { ...BODY, userId: 'x' }],
  ])('%s → 400 sin llegar a Auth', async (_caso, body) => {
    const res = await reset(body);
    expect(res.statusCode).toBe(400);
    expect(passwordReset.reset).not.toHaveBeenCalled();
  });

  it('acepta códigos de hasta 10 dígitos (el largo lo configura Supabase)', async () => {
    expect((await reset({ ...BODY, code: '1234567890' })).statusCode).toBe(200);
  });

  it('Supabase Auth caído → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    passwordReset.reset.mockRejectedValue(new DependencyUnavailableError('auth', 'boom'));
    expect((await reset(BODY)).statusCode).toBe(503);
  });
});

describe('/auth/password — límites y logs (D-48)', () => {
  it.each(['forgot', 'reset'] as const)('%s: la request 11 del minuto desde la misma IP → 429', async (ruta) => {
    const pedir = () => (ruta === 'forgot' ? forgot({ email: 'ana@mail.com' }) : reset(BODY));
    for (let i = 0; i < 10; i++) expect((await pedir()).statusCode).not.toBe(429);
    const res = await pedir();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('los logs no llevan el email, el código ni la contraseña, ni cuando falla', async () => {
    await app?.close();
    const logs: string[] = [];
    app = await armar({ logs });
    passwordReset.reset.mockResolvedValue('invalid_code');
    await reset({ email: 'secreta@mail.com', code: '987654', newPassword: 'clave-secreta' });
    await reset({ email: 'secreta@mail.com', code: '9876', newPassword: 'clave-secreta' });
    await forgot({ email: 'secreta@mail.com' });
    const todo = logs.join('');
    expect(todo).toContain('/auth/password/reset');
    for (const secreto of ['secreta@mail.com', '987654', '9876', 'clave-secreta']) expect(todo).not.toContain(secreto);
  });
});
