import { normalizeEmail, type AuthGateway, type AuthProfiles, type NewProfile } from './ports';

export type SignUpOutcome =
  | 'confirmation_required'
  | 'email_taken'
  | 'username_taken'
  | 'weak_password'
  | 'rejected'
  | 'rate_limited';

export function makeSignUp(deps: { gateway: AuthGateway; profiles: AuthProfiles }) {
  const { gateway, profiles } = deps;
  return {
    /** El usuario y su perfil (D-46): si el perfil no se puede crear, el usuario se borra. */
    async signUp(email: string, password: string, profile: NewProfile, ip: string): Promise<SignUpOutcome> {
      // Antes de crear el usuario: Auth manda el mail de confirmación apenas lo crea.
      if (!(await profiles.isUsernameAvailable(profile.username))) return 'username_taken';

      const created = await gateway.signUp(normalizeEmail(email), password, ip);
      if (typeof created === 'string') return created;

      let result: Awaited<ReturnType<AuthProfiles['createProfile']>>;
      try {
        result = await profiles.createProfile(created.userId, profile);
      } catch (err) {
        await gateway.deleteUser(created.userId);
        throw err;
      }
      // Otro registro ganó el username entre el chequeo y el insert.
      if (result === 'username_taken') {
        await gateway.deleteUser(created.userId);
        return 'username_taken';
      }
      return 'confirmation_required';
    },

    isUsernameAvailable(username: string): Promise<boolean> {
      return profiles.isUsernameAvailable(username);
    },
  };
}

export type SignUp = ReturnType<typeof makeSignUp>;
