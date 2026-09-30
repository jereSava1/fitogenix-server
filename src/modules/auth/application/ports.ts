// Puertos de auth. Supabase Auth, sin estado del lado del server (ADR-0010).

export type SignUpResult = { userId: string } | 'email_taken' | 'weak_password' | 'rejected' | 'rate_limited';

export type ResetPasswordResult = 'ok' | 'invalid_code' | 'same_password' | 'weak_password' | 'rate_limited';

export interface AuthGateway {
  /** Manda el código de recuperación por mail. Nunca dice si el email existe; si Auth no
   *  responde, lanza DependencyUnavailableError. */
  sendPasswordResetCode(email: string): Promise<void>;
  /** Canjea el código y cambia la contraseña. Auth caído → DependencyUnavailableError. */
  resetPassword(email: string, code: string, newPassword: string): Promise<ResetPasswordResult>;
  /** Crea el usuario sin datos personales en la metadata (D-46) y manda el mail de
   *  confirmación. Un email registrado sin confirmar devuelve ese mismo usuario.
   *  Auth caído → DependencyUnavailableError. */
  signUp(email: string, password: string): Promise<SignUpResult>;
  /** Si no se puede borrar, lanza DependencyUnavailableError. */
  deleteUser(userId: string): Promise<void>;
}

export interface NewProfile {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
}

/** Los perfiles de account, inyectados en registerModules. */
export interface SignUpProfiles {
  isUsernameAvailable(username: string): Promise<boolean>;
  /** `exists`: el usuario ya tenía perfil y no se tocó. */
  createProfile(userId: string, profile: NewProfile): Promise<'created' | 'exists' | 'username_taken'>;
}
