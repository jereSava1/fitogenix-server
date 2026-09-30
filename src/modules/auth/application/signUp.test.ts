import { describe, expect, it, vi } from 'vitest';
import type { AuthGateway, SignUpProfiles, SignUpResult } from './ports';
import { makeSignUp } from './signUp';

const PERFIL = { firstName: 'Ana', lastName: 'Pérez', username: 'ana.p', phone: '+5491123456789' };

function armar(opts: { disponible?: boolean; creado?: SignUpResult; perfil?: 'created' | 'exists' | 'username_taken' } = {}) {
  const gateway = {
    sendPasswordResetCode: vi.fn<AuthGateway['sendPasswordResetCode']>(),
    resetPassword: vi.fn<AuthGateway['resetPassword']>(),
    signUp: vi.fn<AuthGateway['signUp']>(async () => opts.creado ?? { userId: 'u-nuevo' }),
    deleteUser: vi.fn<AuthGateway['deleteUser']>(async () => undefined),
  };
  const profiles = {
    isUsernameAvailable: vi.fn<SignUpProfiles['isUsernameAvailable']>(async () => opts.disponible ?? true),
    createProfile: vi.fn<SignUpProfiles['createProfile']>(async () => opts.perfil ?? 'created'),
  };
  return { gateway, profiles, signUp: makeSignUp({ gateway, profiles }) };
}

describe('makeSignUp', () => {
  it('crea el usuario (email normalizado, sin datos personales) y después su perfil', async () => {
    const { gateway, profiles, signUp } = armar();
    await expect(signUp.signUp(' Ana@Mail.com ', 'clave-segura', PERFIL)).resolves.toBe('confirmation_required');
    expect(gateway.signUp).toHaveBeenCalledWith('ana@mail.com', 'clave-segura');
    expect(profiles.createProfile).toHaveBeenCalledWith('u-nuevo', PERFIL);
    expect(gateway.deleteUser).not.toHaveBeenCalled();
  });

  it('username ocupado: ni crea el usuario (Auth mandaría el mail de confirmación)', async () => {
    const { gateway, signUp } = armar({ disponible: false });
    await expect(signUp.signUp('ana@mail.com', 'clave-segura', PERFIL)).resolves.toBe('username_taken');
    expect(gateway.signUp).not.toHaveBeenCalled();
  });

  it.each(['email_taken', 'weak_password', 'rejected', 'rate_limited'] as const)(
    'Auth rechaza (%s): sin perfil',
    async (motivo) => {
      const { profiles, signUp } = armar({ creado: motivo });
      await expect(signUp.signUp('ana@mail.com', 'clave-segura', PERFIL)).resolves.toBe(motivo);
      expect(profiles.createProfile).not.toHaveBeenCalled();
    },
  );

  it('otro ganó el username entre el chequeo y el insert: se borra el usuario recién creado', async () => {
    const { gateway, signUp } = armar({ perfil: 'username_taken' });
    await expect(signUp.signUp('ana@mail.com', 'clave-segura', PERFIL)).resolves.toBe('username_taken');
    expect(gateway.deleteUser).toHaveBeenCalledWith('u-nuevo');
  });

  it('la base falla al crear el perfil: se borra el usuario y sale el error (503)', async () => {
    const { gateway, profiles, signUp } = armar();
    const falla = new Error('base caída');
    profiles.createProfile.mockRejectedValue(falla);
    await expect(signUp.signUp('ana@mail.com', 'clave-segura', PERFIL)).rejects.toBe(falla);
    expect(gateway.deleteUser).toHaveBeenCalledWith('u-nuevo');
  });

  it('si tampoco se puede borrar, sale el error del borrado', async () => {
    const { gateway, signUp } = armar({ perfil: 'username_taken' });
    const falla = new Error('auth caído');
    gateway.deleteUser.mockRejectedValue(falla);
    await expect(signUp.signUp('ana@mail.com', 'clave-segura', PERFIL)).rejects.toBe(falla);
  });

  it('ya tenía perfil (se registró y no confirmó): Auth reenvió el mail; ni se toca ni se borra', async () => {
    const { gateway, signUp } = armar({ perfil: 'exists' });
    await expect(signUp.signUp('ana@mail.com', 'clave-segura', PERFIL)).resolves.toBe('confirmation_required');
    expect(gateway.deleteUser).not.toHaveBeenCalled();
  });

  it('isUsernameAvailable delega en los perfiles', async () => {
    const { profiles, signUp } = armar({ disponible: false });
    await expect(signUp.isUsernameAvailable('ana.p')).resolves.toBe(false);
    expect(profiles.isUsernameAvailable).toHaveBeenCalledWith('ana.p');
  });
});
