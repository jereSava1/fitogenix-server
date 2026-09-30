// Puertos de auth. Supabase Auth, sin estado del lado del server (ADR-0010).

export type ResetPasswordResult = 'ok' | 'invalid_code' | 'same_password' | 'weak_password' | 'rate_limited';

export interface AuthGateway {
  /** Manda el código de recuperación por mail. Nunca dice si el email existe; si Auth no
   *  responde, lanza DependencyUnavailableError. */
  sendPasswordResetCode(email: string): Promise<void>;
  /** Canjea el código y cambia la contraseña. Auth caído → DependencyUnavailableError. */
  resetPassword(email: string, code: string, newPassword: string): Promise<ResetPasswordResult>;
}
