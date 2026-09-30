// Perfil (F-05): el usuario sale siempre del token; el body solo trae los campos a cambiar.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AJV_OPTIONS } from '../../../platform/http/buildApp';
import { registerErrorHandling } from '../../../platform/http/errors';
import { simularSupabaseAuth, SUPABASE_URL } from '../../../testing/supabaseAuth';
import type { Profile } from '../application/ports';
import type { ProfileService } from '../application/profile';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PERFIL: Profile = { firstName: 'Ana', lastName: 'Pérez', username: 'ana.p', phone: '+5491123456789' };
const VALIDATION = { error: 'La solicitud no es válida.', code: 'VALIDATION_ERROR' };
const NO_ESTA = { error: 'Todavía no completaste tus datos personales', code: 'NOT_FOUND' };

const profile = {
  getProfile: vi.fn<ProfileService['getProfile']>(),
  updateProfile: vi.fn<ProfileService['updateProfile']>(),
};
let app: FastifyInstance;
let comoA: { authorization: string };
let comoB: { authorization: string };

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const auth = await simularSupabaseAuth();
  vi.stubGlobal('fetch', auth.fetch);
  comoA = { authorization: `Bearer ${await auth.token(USER_A)}` };
  comoB = { authorization: `Bearer ${await auth.token(USER_B)}` };

  const { profileRoutes } = await import('./profile.route');
  app = Fastify({ ajv: AJV_OPTIONS });
  registerErrorHandling(app); // como en producción (buildApp)
  await app.register(profileRoutes({ profile }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  profile.getProfile.mockResolvedValue(PERFIL);
  profile.updateProfile.mockImplementation(async (_id, changes) => ({ ...PERFIL, ...changes }));
});

const patch = (payload: unknown, headers = comoA) =>
  app.inject({ method: 'PATCH', url: '/users/me/profile', headers, payload: payload as never });

describe('perfil — sin sesión', () => {
  it.each(['GET', 'PATCH'] as const)('%s sin token → 401 sin llegar al servicio', async (method) => {
    const res = await app.inject({ method, url: '/users/me/profile', payload: method === 'PATCH' ? { firstName: 'X' } : undefined });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Falta el token de sesión', code: 'UNAUTHENTICATED' });
    expect(profile.getProfile).not.toHaveBeenCalled();
    expect(profile.updateProfile).not.toHaveBeenCalled();
  });
});

describe('GET /users/me/profile', () => {
  it('200 con los cuatro campos del perfil del usuario del token', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/profile', headers: comoA });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(PERFIL);
    expect(profile.getProfile).toHaveBeenCalledWith(USER_A);
  });

  it('campos vacíos en la base salen como null', async () => {
    profile.getProfile.mockResolvedValue({ firstName: null, lastName: null, username: 'ana', phone: null });
    const res = await app.inject({ method: 'GET', url: '/users/me/profile', headers: comoA });
    expect(res.json()).toEqual({ firstName: null, lastName: null, username: 'ana', phone: null });
  });

  it('sin fila de perfil → 404 NOT_FOUND', async () => {
    profile.getProfile.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/users/me/profile', headers: comoA });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_ESTA);
  });
});

describe('PATCH /users/me/profile', () => {
  it('200 con el perfil actualizado; al servicio le llegan solo los campos enviados', async () => {
    const res = await patch({ firstName: 'Anita', phone: '+5491100000000' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ...PERFIL, firstName: 'Anita', phone: '+5491100000000' });
    expect(profile.updateProfile).toHaveBeenCalledWith(USER_A, { firstName: 'Anita', phone: '+5491100000000' });
  });

  it.each([
    ['username', { username: 'ana_2026' }],
    ['username con punto y números', { username: 'a.b.1' }],
    ['nombre de 60 caracteres', { lastName: 'x'.repeat(60) }],
    ['teléfono E.164 corto (7 dígitos)', { phone: '+1234567' }],
  ])('acepta %s', async (_caso, body) => {
    expect((await patch(body)).statusCode).toBe(200);
  });

  it.each([
    ['sin body', undefined],
    ['body vacío (ningún campo)', {}],
    ['campo de más (D-70)', { firstName: 'Ana', email: 'x@y.z' }],
    ['userId en el body', { firstName: 'Ana', userId: USER_B }],
    ['nombre vacío', { firstName: '' }],
    ['nombre de espacios', { firstName: '   ' }],
    ['nombre de 61 caracteres', { firstName: 'x'.repeat(61) }],
    ['null para borrar un campo', { phone: null }],
    ['username con mayúsculas', { username: 'Ana' }],
    ['username corto', { username: 'ab' }],
    ['username largo', { username: 'a'.repeat(31) }],
    ['username con espacio o arroba', { username: 'ana p' }],
    ['teléfono sin +', { phone: '5491123456789' }],
    ['teléfono con espacios', { phone: '+54 9 11 2345 6789' }],
    ['teléfono que empieza en 0', { phone: '+0491123456789' }],
    ['teléfono de más de 15 dígitos', { phone: '+1234567890123456' }],
  ])('%s → 400 sin llegar al servicio', async (_caso, body) => {
    const res = await patch(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(VALIDATION);
    expect(profile.updateProfile).not.toHaveBeenCalled();
  });

  it('username de otro → 409 USERNAME_TAKEN', async () => {
    profile.updateProfile.mockResolvedValue('username_taken');
    const res = await patch({ username: 'tomado' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Ese nombre de usuario ya está en uso', code: 'USERNAME_TAKEN' });
  });

  it('sin fila de perfil → 404 NOT_FOUND', async () => {
    profile.updateProfile.mockResolvedValue('not_found');
    const res = await patch({ firstName: 'Ana' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(NO_ESTA);
  });
});

describe('perfil — base caída', () => {
  it.each([
    ['GET', () => profile.getProfile],
    ['PATCH', () => profile.updateProfile],
  ] as const)('%s → 503', async (method, servicio) => {
    const { DependencyUnavailableError } = await import('../../../platform/dependencyError');
    servicio().mockRejectedValue(new DependencyUnavailableError('supabase', 'boom'));
    const res = await app.inject({ method, url: '/users/me/profile', headers: comoA, payload: method === 'PATCH' ? { firstName: 'Ana' } : undefined });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
});

describe('perfil — aislamiento entre usuarios (RNF-S03)', () => {
  const intentoDeB = { 'x-user-id': USER_B, 'x-userid': USER_B };

  it('cada token ve y edita lo suyo', async () => {
    await app.inject({ method: 'GET', url: '/users/me/profile', headers: comoA });
    await app.inject({ method: 'GET', url: '/users/me/profile', headers: comoB });
    await patch({ firstName: 'B' }, comoB);
    expect(profile.getProfile.mock.calls).toEqual([[USER_A], [USER_B]]);
    expect(profile.updateProfile).toHaveBeenCalledWith(USER_B, { firstName: 'B' });
  });

  it('el id de otro en query o headers se ignora', async () => {
    await app.inject({ method: 'GET', url: `/users/me/profile?userId=${USER_B}`, headers: { ...comoA, ...intentoDeB } });
    await app.inject({
      method: 'PATCH', url: `/users/me/profile?userId=${USER_B}`, headers: { ...comoA, ...intentoDeB }, payload: { firstName: 'Ana' },
    });
    expect(profile.getProfile).toHaveBeenCalledWith(USER_A);
    expect(profile.updateProfile).toHaveBeenCalledWith(USER_A, { firstName: 'Ana' });
  });
});
