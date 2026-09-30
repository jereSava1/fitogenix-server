import type { Profile, ProfileChanges, ProfileRepository, UpdateProfileResult } from './ports';

export function makeProfile(repo: ProfileRepository) {
  return {
    /** `null` si el usuario no tiene fila en `profiles`. */
    getProfile(userId: string): Promise<Profile | null> {
      return repo.get(userId);
    },

    updateProfile(userId: string, changes: ProfileChanges): Promise<UpdateProfileResult> {
      return repo.update(userId, changes);
    },
  };
}

export type ProfileService = ReturnType<typeof makeProfile>;
