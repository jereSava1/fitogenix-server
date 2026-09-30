import type { FailedAttempts } from './failedAttempts';
import { normalizeEmail, type AuthGateway, type AuthProfiles, type Credential, type RefreshResult, type Session } from './ports';

export type SignInOutcome =
  | Session
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | { tooManyAttempts: number };

/** Solo la contraseña se adivina probando: los tokens de un proveedor no cuentan intentos. */
function attemptsKey(credential: Credential): string | null {
  return credential.kind === 'password' ? credential.email : null;
}

function normalized(credential: Credential): Credential {
  return credential.kind === 'password' ? { ...credential, email: normalizeEmail(credential.email) } : credential;
}

/** Iniciar sesión con cualquier proveedor, refrescarla y cerrarla: el mismo camino para todos. */
export function makeSessions(deps: { gateway: AuthGateway; profiles: AuthProfiles; attempts: FailedAttempts }) {
  const { gateway, profiles, attempts } = deps;
  return {
    async signIn(input: Credential, ip: string): Promise<SignInOutcome> {
      const credential = normalized(input);
      const key = attemptsKey(credential);
      const blocked = key ? attempts.blockedFor(key) : 0;
      if (blocked > 0) return { tooManyAttempts: blocked };

      const result = await gateway.signIn(credential, ip);
      if (typeof result === 'string') {
        if (result === 'invalid_credentials' && key) attempts.fail(key);
        return result;
      }
      if (key) attempts.clear(key);
      // Con un proveedor, el primer inicio de sesión es el registro (03-contratos §B.4.6).
      await profiles.ensureProfile(result.session.user.id, result.names);
      return result.session;
    },

    refresh(refreshToken: string, ip: string): Promise<RefreshResult> {
      return gateway.refresh(refreshToken, ip);
    },

    signOut(accessToken: string): Promise<void> {
      return gateway.signOut(accessToken);
    },
  };
}

export type Sessions = ReturnType<typeof makeSessions>;
