import type { FailedAttempts } from './failedAttempts';
import type { AuthGateway, ResetPasswordResult } from './ports';

export type PasswordResetResult = ResetPasswordResult | { tooManyAttempts: number };

const keyOf = (email: string) => email.trim().toLowerCase();

export function makePasswordReset(deps: { gateway: AuthGateway; attempts: FailedAttempts }) {
  const { gateway, attempts } = deps;
  return {
    /** Siempre "enviado" para quien pregunta: no revela si el email existe (RF-025). */
    forgot(email: string): Promise<void> {
      return gateway.sendPasswordResetCode(keyOf(email));
    },

    /** Con demasiados códigos fallidos para ese email, ni se consulta a Auth. */
    async reset(email: string, code: string, newPassword: string): Promise<PasswordResetResult> {
      const key = keyOf(email);
      const blocked = attempts.blockedFor(key);
      if (blocked > 0) return { tooManyAttempts: blocked };

      const result = await gateway.resetPassword(key, code, newPassword);
      if (result === 'invalid_code') attempts.fail(key);
      if (result === 'ok') attempts.clear(key);
      return result;
    },
  };
}

export type PasswordReset = ReturnType<typeof makePasswordReset>;
