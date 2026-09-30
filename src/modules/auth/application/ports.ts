// Puertos de auth. Supabase Auth, sin estado del lado del server (ADR-0010). `ip` es la del
// usuario (`request.ip`): Supabase aplica sus límites por IP con ella (D-30).

/** Con qué se identifica la persona. Un proveedor nuevo es una variante más acá y en el adaptador. */
export type Credential =
  | { kind: 'password'; email: string; password: string }
  | { kind: 'id_token'; provider: IdTokenProvider; idToken: string; nonce?: string; names?: PersonNames };

export type IdTokenProvider = 'google' | 'apple';

export interface PersonNames {
  firstName: string | null;
  lastName: string | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Segundos desde epoch. */
  expiresAt: number;
  user: { id: string; email: string | null };
}

/** `names`: lo que trae el proveedor, para el perfil del primer inicio de sesión. */
export type SignInResult =
  | { session: Session; names: PersonNames }
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited';

export type RefreshResult = Session | 'invalid_refresh_token' | 'rate_limited';

export type SignUpResult = { userId: string } | 'email_taken' | 'weak_password' | 'rejected' | 'rate_limited';

export type ResetPasswordResult = 'ok' | 'invalid_code' | 'same_password' | 'weak_password' | 'rate_limited';

/** Auth caído (red, timeout, 5xx) → DependencyUnavailableError en todos los métodos. */
export interface AuthGateway {
  signIn(credential: Credential, ip: string): Promise<SignInResult>;
  refresh(refreshToken: string, ip: string): Promise<RefreshResult>;
  /** Revoca la sesión de ese token (solo ese dispositivo). Una ya revocada no es error. */
  signOut(accessToken: string): Promise<void>;
  /** Crea el usuario sin datos personales en la metadata (D-46) y manda el mail de
   *  confirmación. Un email registrado sin confirmar devuelve ese mismo usuario. */
  signUp(email: string, password: string, ip: string): Promise<SignUpResult>;
  deleteUser(userId: string): Promise<void>;
  /** Manda el código de recuperación por mail. Nunca dice si el email existe. */
  sendPasswordResetCode(email: string, ip: string): Promise<void>;
  /** Canjea el código y cambia la contraseña. */
  resetPassword(email: string, code: string, newPassword: string, ip: string): Promise<ResetPasswordResult>;
}

export interface NewProfile {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
}

/** Los perfiles de account, inyectados en registerModules. */
export interface AuthProfiles {
  isUsernameAvailable(username: string): Promise<boolean>;
  /** `exists`: el usuario ya tenía perfil y no se tocó. */
  createProfile(userId: string, profile: NewProfile): Promise<'created' | 'exists' | 'username_taken'>;
  /** Primer inicio de sesión con un proveedor: crea el perfil con los nombres si no hay. */
  ensureProfile(userId: string, names: PersonNames): Promise<void>;
}

/** Email como clave: Auth, el límite de intentos y el perfil lo ven igual. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
