import type { FailedAttempts } from './failedAttempts';
import { normalizeEmail, type AuthGateway, type ResetPasswordResult } from './ports';

export type PasswordResetResult = ResetPasswordResult | { tooManyAttempts: number };

export function makePasswordReset(deps: { gateway: AuthGateway; attempts: FailedAttempts }) {
  const { gateway, attempts } = deps;
  return {
    /** Siempre "enviado" para quien pregunta: no revela si el email existe (RF-025). */
    forgot(email: string, ip: string): Promise<void> {
      return gateway.sendPasswordResetCode(normalizeEmail(email), ip);
    },

    /** Con demasiados códigos fallidos para ese email, ni se consulta a Auth. */
    async reset(email: string, code: string, newPassword: string, ip: string): Promise<PasswordResetResult> {
      const key = normalizeEmail(email);
      const blocked = attempts.blockedFor(key);
      if (blocked > 0) return { tooManyAttempts: blocked };

      const result = await gateway.resetPassword(key, code, newPassword, ip);
      if (result === 'invalid_code') attempts.fail(key);
      if (result === 'ok') attempts.clear(key);
      return result;
    },
  };
}

export type PasswordReset = ReturnType<typeof makePasswordReset>;
