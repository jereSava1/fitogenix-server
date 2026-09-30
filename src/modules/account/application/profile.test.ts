import { describe, expect, it, vi } from 'vitest';
import type { ProfileRepository } from './ports';
import { makeProfile } from './profile';

describe('makeProfile', () => {
  it('getProfile y updateProfile delegan en el repositorio', async () => {
    const perfil = { firstName: 'Ana', lastName: null, username: 'ana', phone: null };
    const repo: ProfileRepository = {
      get: vi.fn(async () => perfil),
      update: vi.fn(async () => 'username_taken' as const),
    };
    const profile = makeProfile(repo);

    await expect(profile.getProfile('user-1')).resolves.toEqual(perfil);
    await expect(profile.updateProfile('user-1', { username: 'x.y' })).resolves.toBe('username_taken');
    expect(repo.get).toHaveBeenCalledWith('user-1');
    expect(repo.update).toHaveBeenCalledWith('user-1', { username: 'x.y' });
  });
});
