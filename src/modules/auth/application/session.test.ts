import { describe, expect, it } from 'vitest';
import { failedAttempts } from './failedAttempts';
import type { Credential } from './ports';
import { makeSessions } from './session';
import { fakeGateway, fakeProfiles, SESSION } from '../testing/fakes';

const IP = '203.0.113.7';
const PASSWORD: Credential = { kind: 'password', email: ' Ana@Mail.com ', password: 'clave' };
const GOOGLE: Credential = { kind: 'id_token', provider: 'google', idToken: 'token-google' };
const APPLE: Credential = {
  kind: 'id_token', provider: 'apple', idToken: 'token-apple', nonce: 'n', names: { firstName: 'Ana', lastName: null },
};

function armar() {
  const gateway = fakeGateway();
  const profiles = fakeProfiles();
  const attempts = failedAttempts({ max: 2, windowMs: 60_000 });
  return { gateway, profiles, attempts, sessions: makeSessions({ gateway, profiles, attempts }) };
}

describe('makeSessions.signIn: el mismo camino para todos los proveedores', () => {
  it.each([
    ['email', PASSWORD],
    ['Google', GOOGLE],
    ['Apple', APPLE],
  ])('%s: sesión y perfil asegurado con los nombres del proveedor', async (_p, credential) => {
    const { gateway, profiles, sessions } = armar();
    gateway.signIn.mockResolvedValue({ session: SESSION, names: { firstName: 'Ana', lastName: 'Pérez' } });
    await expect(sessions.signIn(credential, IP)).resolves.toEqual(SESSION);
    expect(gateway.signIn).toHaveBeenCalledWith(expect.objectContaining({ kind: credential.kind }), IP);
    expect(profiles.ensureProfile).toHaveBeenCalledWith('u-1', { firstName: 'Ana', lastName: 'Pérez' });
  });

  it('normaliza el email; los tokens de proveedor pasan tal cual', async () => {
    const { gateway, sessions } = armar();
    await sessions.signIn(PASSWORD, IP);
    expect(gateway.signIn).toHaveBeenLastCalledWith({ ...PASSWORD, email: 'ana@mail.com' }, IP);
    await sessions.signIn(APPLE, IP);
    expect(gateway.signIn).toHaveBeenLastCalledWith(APPLE, IP);
  });

  it.each(['invalid_credentials', 'email_not_confirmed', 'rate_limited'] as const)('%s: sin sesión ni perfil', async (motivo) => {
    const { gateway, profiles, sessions } = armar();
    gateway.signIn.mockResolvedValue(motivo);
    await expect(sessions.signIn(GOOGLE, IP)).resolves.toBe(motivo);
    expect(profiles.ensureProfile).not.toHaveBeenCalled();
  });

  it('con contraseña, demasiados fallos para ese email → ni consulta a Auth (D-48)', async () => {
    const { gateway, sessions } = armar();
    gateway.signIn.mockResolvedValue('invalid_credentials');
    await sessions.signIn(PASSWORD, IP);
    await sessions.signIn({ ...PASSWORD, email: 'ana@mail.com' }, IP);
    await expect(sessions.signIn(PASSWORD, IP)).resolves.toMatchObject({ tooManyAttempts: expect.any(Number) });
    expect(gateway.signIn).toHaveBeenCalledTimes(2);
  });

  it('un login correcto limpia los fallos; email sin confirmar no cuenta como fallo', async () => {
    const { gateway, attempts, sessions } = armar();
    gateway.signIn.mockResolvedValueOnce('invalid_credentials');
    await sessions.signIn(PASSWORD, IP);
    await sessions.signIn(PASSWORD, IP);
    gateway.signIn.mockResolvedValueOnce('invalid_credentials');
    await sessions.signIn(PASSWORD, IP);
    // Sin limpiar, serían 2 fallos: bloqueado.
    expect(attempts.blockedFor('ana@mail.com')).toBe(0);
    gateway.signIn.mockResolvedValue('email_not_confirmed');
    for (let i = 0; i < 3; i++) await sessions.signIn(PASSWORD, IP);
    expect(attempts.blockedFor('ana@mail.com')).toBe(0);
  });

  it('los tokens de proveedor no cuentan intentos (no hay contraseña que adivinar)', async () => {
    const { gateway, sessions } = armar();
    gateway.signIn.mockResolvedValue('invalid_credentials');
    for (let i = 0; i < 3; i++) await expect(sessions.signIn(GOOGLE, IP)).resolves.toBe('invalid_credentials');
    expect(gateway.signIn).toHaveBeenCalledTimes(3);
  });

  it('si el perfil no se puede asegurar, sale el error (503) y no la sesión', async () => {
    const { profiles, sessions } = armar();
    const falla = new Error('base caída');
    profiles.ensureProfile.mockRejectedValue(falla);
    await expect(sessions.signIn(GOOGLE, IP)).rejects.toBe(falla);
  });
});

describe('makeSessions.refresh y signOut', () => {
  it('delegan en Auth con la IP y el token', async () => {
    const { gateway, sessions } = armar();
    await expect(sessions.refresh('refresh', IP)).resolves.toEqual(SESSION);
    expect(gateway.refresh).toHaveBeenCalledWith('refresh', IP);
    await sessions.signOut('access');
    expect(gateway.signOut).toHaveBeenCalledWith('access');
  });
});
