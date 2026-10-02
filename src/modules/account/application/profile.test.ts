import { describe, expect, it, vi } from 'vitest';
import type { ProfileRepository } from './ports';
import { makeProfile } from './profile';

describe('makeProfile', () => {
  const perfil = { firstName: 'Ana', lastName: null, username: 'ana', phone: null };
  const armar = (taken = false): ProfileRepository => ({
    get: vi.fn(async () => perfil),
    update: vi.fn(async () => 'username_taken' as const),
    isUsernameTaken: vi.fn(async () => taken),
    create: vi.fn(async () => 'created' as const),
    ensure: vi.fn(async () => undefined),
  });

  it('getProfile y updateProfile delegan en el repositorio', async () => {
    const repo = armar();
    const profile = makeProfile(repo);

    await expect(profile.getProfile('user-1')).resolves.toEqual(perfil);
    await expect(profile.updateProfile('user-1', { username: 'x.y' })).resolves.toBe('username_taken');
    expect(repo.get).toHaveBeenCalledWith('user-1');
    expect(repo.update).toHaveBeenCalledWith('user-1', { username: 'x.y' });
  });

  it('isUsernameAvailable es lo contrario de isUsernameTaken; createProfile y ensureProfile delegan', async () => {
    await expect(makeProfile(armar(true)).isUsernameAvailable('ana')).resolves.toBe(false);
    const repo = armar(false);
    const profile = makeProfile(repo);
    await expect(profile.isUsernameAvailable('ana')).resolves.toBe(true);
    const nuevo = { firstName: 'Ana', lastName: 'Pérez', username: 'ana', phone: '+5491123456789' };
    await expect(profile.createProfile('user-1', nuevo)).resolves.toBe('created');
    expect(repo.create).toHaveBeenCalledWith('user-1', nuevo);
    await profile.ensureProfile('user-1', { firstName: 'Ana', lastName: null });
    expect(repo.ensure).toHaveBeenCalledWith('user-1', { firstName: 'Ana', lastName: null });
  });
});
