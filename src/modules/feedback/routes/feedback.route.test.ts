// Feedback y reportes (F-07) con la app base real (errores y rate limit): con o sin sesión, el
// usuario sale solo del token.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { simularSupabaseAuth, SUPABASE_URL } from '../../../testing/supabaseAuth';
import type { FeedbackService } from '../application/feedback';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VALIDATION = { error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' };

const feedback = {
  send: vi.fn<FeedbackService['send']>(),
  report: vi.fn<FeedbackService['report']>(),
};
let armar: () => Promise<FastifyInstance>;
let app: FastifyInstance | undefined;
let comoUsuario: { authorization: string };
let tokenVencido: { authorization: string };

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const auth = await simularSupabaseAuth();
  vi.stubGlobal('fetch', auth.fetch);
  comoUsuario = { authorization: `Bearer ${await auth.token(USER)}` };
  tokenVencido = { authorization: `Bearer ${await auth.token(USER, { exp: Math.floor(Date.now() / 1000) - 60 })}` };

  const { buildApp } = await import('../../../platform/http/buildApp');
  const { feedbackRoutes } = await import('./feedback.route');
  armar = async () => {
    const nueva = await buildApp();
    await nueva.register(feedbackRoutes({ feedback }));
    await nueva.ready();
    return nueva;
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  feedback.send.mockResolvedValue(undefined);
  feedback.report.mockResolvedValue('ok');
  app = await armar();
});

afterEach(async () => {
  await app?.close();
});

const enviar = (payload: unknown, headers: Record<string, string> = {}) =>
  app!.inject({ method: 'POST', url: '/feedback', headers, payload: payload as never });
const reportar = (payload: unknown, headers: Record<string, string> = {}, productId = PRODUCT_ID) =>
  app!.inject({ method: 'POST', url: `/products/${productId}/reports`, headers, payload: payload as never });

describe('POST /feedback', () => {
  it('anónimo → 202 { ok: true } sin usuario', async () => {
    const res = await enviar({ message: 'Me encanta la app', appVersion: '1.2.0', platform: 'ios' });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(feedback.send).toHaveBeenCalledWith({ userId: null, message: 'Me encanta la app', appVersion: '1.2.0', platform: 'ios' });
  });

  it('con sesión → guarda el usuario del token', async () => {
    expect((await enviar({ message: 'Hola' }, comoUsuario)).statusCode).toBe(202);
    expect(feedback.send).toHaveBeenCalledWith({ userId: USER, message: 'Hola' });
  });

  it('token vencido o roto → se guarda como anónimo (no 401)', async () => {
    expect((await enviar({ message: 'Hola' }, tokenVencido)).statusCode).toBe(202);
    expect((await enviar({ message: 'Hola' }, { authorization: 'Bearer basura' })).statusCode).toBe(202);
    expect(feedback.send.mock.calls.map(([input]) => input.userId)).toEqual([null, null]);
  });

  it.each([
    ['sin body', undefined],
    ['sin mensaje', {}],
    ['mensaje vacío', { message: '' }],
    ['mensaje solo con espacios', { message: '   \n ' }],
    ['mensaje de 2001', { message: 'x'.repeat(2001) }],
    ['plataforma desconocida', { message: 'Hola', platform: 'web' }],
    ['appVersion de 33', { message: 'Hola', appVersion: '1'.repeat(33) }],
    ['appVersion con espacios', { message: 'Hola', appVersion: '1.0 beta' }],
    ['userId en el body (D-70)', { message: 'Hola', userId: USER }],
  ])('%s → 400 sin guardar nada', async (_caso, body) => {
    const res = await enviar(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(feedback.send).not.toHaveBeenCalled();
  });

  it('acepta un mensaje de 2000', async () => {
    expect((await enviar({ message: 'x'.repeat(2000) })).statusCode).toBe(202);
  });

  it('la base caída → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    feedback.send.mockRejectedValue(new DependencyUnavailableError('supabase', 'boom'));
    const res = await enviar({ message: 'Hola' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
});

describe('POST /products/:productId/reports', () => {
  it('anónimo → 202 con el producto de la URL', async () => {
    const res = await reportar({ type: 'score', message: 'El puntaje no cierra' });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
    expect(feedback.report).toHaveBeenCalledWith({ userId: null, productId: PRODUCT_ID, type: 'score', message: 'El puntaje no cierra' });
  });

  it('con sesión y sin mensaje → 202 con el usuario del token', async () => {
    expect((await reportar({ type: 'image' }, comoUsuario)).statusCode).toBe(202);
    expect(feedback.report).toHaveBeenCalledWith({ userId: USER, productId: PRODUCT_ID, type: 'image' });
  });

  it('producto que no está en el catálogo → 404 NOT_FOUND', async () => {
    feedback.report.mockResolvedValue('product_not_found');
    const res = await reportar({ type: 'info' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Producto no encontrado en el catálogo', code: 'NOT_FOUND' });
  });

  it.each([
    ['sin tipo', { message: 'x' }],
    ['tipo desconocido', { type: 'spam' }],
    ['mensaje de 2001', { type: 'other', message: 'x'.repeat(2001) }],
    ['productId en el body (D-70)', { type: 'info', productId: PRODUCT_ID }],
  ])('%s → 400 sin guardar nada', async (_caso, body) => {
    const res = await reportar(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(feedback.report).not.toHaveBeenCalled();
  });

  it('id que no es uuid → 400', async () => {
    expect((await reportar({ type: 'info' }, {}, '7790000000017')).statusCode).toBe(400);
    expect(feedback.report).not.toHaveBeenCalled();
  });

  it('la base caída → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    feedback.report.mockRejectedValue(new DependencyUnavailableError('supabase', 'boom'));
    expect((await reportar({ type: 'info' })).statusCode).toBe(503);
  });
});

describe('límite (D-48): 5 por minuto por IP en cada ruta', () => {
  it.each(['feedback', 'reports'] as const)('%s: la sexta request del minuto → 429 con retry-after', async (ruta) => {
    const pedir = () => (ruta === 'feedback' ? enviar({ message: 'Hola' }) : reportar({ type: 'info' }));
    for (let i = 0; i < 5; i++) expect((await pedir()).statusCode).toBe(202);
    const res = await pedir();
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(ruta === 'feedback' ? feedback.send : feedback.report).toHaveBeenCalledTimes(5);
  });

  it('las requests inválidas también cuentan', async () => {
    for (let i = 0; i < 5; i++) expect((await enviar({})).statusCode).toBe(400);
    expect((await enviar({ message: 'Hola' })).statusCode).toBe(429);
  });
});
