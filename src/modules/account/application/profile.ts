import type {
  CreateProfileResult,
  NewProfile,
  Profile,
  ProfileChanges,
  ProfileRepository,
  UpdateProfileResult,
} from './ports';

export function makeProfile(repo: ProfileRepository) {
  return {
    /** `null` si el usuario no tiene fila en `profiles`. */
    getProfile(userId: string): Promise<Profile | null> {
      return repo.get(userId);
    },

    updateProfile(userId: string, changes: ProfileChanges): Promise<UpdateProfileResult> {
      return repo.update(userId, changes);
    },

    async isUsernameAvailable(username: string): Promise<boolean> {
      return !(await repo.isUsernameTaken(username));
    },

    createProfile(userId: string, profile: NewProfile): Promise<CreateProfileResult> {
      return repo.create(userId, profile);
    },
  };
}

export type ProfileService = ReturnType<typeof makeProfile>;
