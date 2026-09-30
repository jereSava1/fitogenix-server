// Onboarding (F-06): el usuario sale del token; los datos de salud solo con consentimiento.
import { Writable } from 'node:stream';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { simularSupabaseAuth, SUPABASE_URL } from '../../../testing/supabaseAuth';
import type { OnboardingService } from '../application/onboarding';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VALIDATION = { error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' };
const RESPUESTAS = { goals: ['energy'], symptoms: ['fog'], diets: ['kosher'], allergies: ['peanut'], avoid: [], source: 'doctor' };
const CONSENTIMIENTO = { healthData: true, textVersion: '2026-09-30' };

const onboarding = { save: vi.fn<OnboardingService['save']>() };
let armar: (logs?: string[]) => Promise<FastifyInstance>;
let app: FastifyInstance | undefined;
let comoUsuario: { authorization: string };

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const auth = await simularSupabaseAuth();
  vi.stubGlobal('fetch', auth.fetch);
  comoUsuario = { authorization: `Bearer ${await auth.token(USER)}` };

  const { buildApp, LOG_REDACT } = await import('../../../platform/http/buildApp');
  const { onboardingRoutes } = await import('./onboarding.route');
  armar = async (logs) => {
    const stream = new Writable({
      write(chunk, _enc, done) {
        logs?.push(String(chunk));
        done();
      },
    });
    const nueva = await buildApp(logs ? { logger: { stream, redact: LOG_REDACT } } : {});
    await nueva.register(onboardingRoutes({ onboarding }));
    await nueva.ready();
    return nueva;
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  onboarding.save.mockResolvedValue('ok');
  app = await armar();
});

afterEach(async () => {
  await app?.close();
});

const enviar = (payload: unknown, headers: Record<string, string> = comoUsuario) =>
  app!.inject({ method: 'POST', url: '/users/me/onboarding', headers, payload: payload as never });

describe('POST /users/me/onboarding', () => {
  it('sin token → 401 sin llegar al servicio', async () => {
    const res = await enviar({ answers: RESPUESTAS, consent: CONSENTIMIENTO }, {});
    expect(res.statusCode).toBe(401);
    expect(onboarding.save).not.toHaveBeenCalled();
  });

  it('200 { ok: true } con el usuario del token, las respuestas y el consentimiento', async () => {
    const res = await enviar({ answers: RESPUESTAS, consent: CONSENTIMIENTO });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(onboarding.save).toHaveBeenCalledWith(USER, RESPUESTAS, CONSENTIMIENTO);
  });

  it('sin consentimiento (no hace falta si no hay datos de salud) → llega sin consent', async () => {
    const sinSalud = { ...RESPUESTAS, symptoms: [], diets: [], allergies: [] };
    expect((await enviar({ answers: sinSalud })).statusCode).toBe(200);
    expect(onboarding.save).toHaveBeenCalledWith(USER, sinSalud, undefined);
  });

  it('datos de salud sin consentimiento → 400 con el motivo', async () => {
    onboarding.save.mockResolvedValue('consent_required');
    const res = await enviar({ answers: RESPUESTAS });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'Para guardar síntomas, dietas o alergias necesitamos tu consentimiento.',
      code: 'VALIDATION_ERROR',
    });
  });

  it.each([
    ['sin body', undefined],
    ['sin answers', { consent: CONSENTIMIENTO }],
    ['falta una lista', { answers: { ...RESPUESTAS, avoid: undefined } }],
    ['falta source (puede ser null, no faltar)', { answers: { ...RESPUESTAS, source: undefined } }],
    ['opción desconocida', { answers: { ...RESPUESTAS, goals: ['volar'] } }],
    ['etiqueta en vez de clave', { answers: { ...RESPUESTAS, allergies: ['Maní'] } }],
    ['opción repetida', { answers: { ...RESPUESTAS, symptoms: ['fog', 'fog'] } }],
    ['source desconocido', { answers: { ...RESPUESTAS, source: 'radio' } }],
    ['campo de más en answers (D-70)', { answers: { ...RESPUESTAS, weight: 80 } }],
    ['campo de más en el body (D-70)', { answers: RESPUESTAS, consent: CONSENTIMIENTO, userId: 'otro' }],
    ['consent sin versión', { answers: RESPUESTAS, consent: { healthData: true } }],
    ['versión vacía', { answers: RESPUESTAS, consent: { healthData: true, textVersion: '' } }],
    ['versión con espacios', { answers: RESPUESTAS, consent: { healthData: true, textVersion: 'v 1' } }],
    ['healthData como texto', { answers: RESPUESTAS, consent: { healthData: 'true', textVersion: 'v1' } }],
    ['healthData como número', { answers: RESPUESTAS, consent: { healthData: 1, textVersion: 'v1' } }],
    ['healthData en false (sin consentimiento no se manda consent)', { answers: RESPUESTAS, consent: { healthData: false, textVersion: 'v1' } }],
  ])('%s → 400 sin guardar nada', async (_caso, body) => {
    const res = await enviar(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(onboarding.save).not.toHaveBeenCalled();
  });

  it('acepta source null y listas vacías', async () => {
    const vacias = { goals: [], symptoms: [], diets: [], allergies: [], avoid: [], source: null };
    expect((await enviar({ answers: vacias })).statusCode).toBe(200);
  });

  it('la base caída → 503', async () => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    onboarding.save.mockRejectedValue(new DependencyUnavailableError('supabase', 'boom'));
    const res = await enviar({ answers: RESPUESTAS, consent: CONSENTIMIENTO });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });

  it('los datos de salud no van a los logs, ni cuando se rechazan', async () => {
    await app?.close();
    const logs: string[] = [];
    app = await armar(logs);
    await enviar({ answers: RESPUESTAS, consent: CONSENTIMIENTO });
    onboarding.save.mockResolvedValue('consent_required');
    await enviar({ answers: RESPUESTAS });
    await enviar({ answers: { ...RESPUESTAS, symptoms: ['fog', 'fog'] } });
    const todo = logs.join('');
    expect(todo).toContain('/users/me/onboarding');
    for (const dato of ['"fog"', 'peanut', 'kosher']) expect(todo).not.toContain(dato);
  });
});
