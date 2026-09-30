import { describe, expect, it, vi } from 'vitest';
import { failedAttempts } from './failedAttempts';
import type { AuthGateway } from './ports';
import { makePasswordReset } from './resetPassword';

function armar(resultado: Awaited<ReturnType<AuthGateway['resetPassword']>> = 'ok') {
  const gateway = {
    sendPasswordResetCode: vi.fn<AuthGateway['sendPasswordResetCode']>(async () => undefined),
    resetPassword: vi.fn<AuthGateway['resetPassword']>(async () => resultado),
    signUp: vi.fn<AuthGateway['signUp']>(),
    deleteUser: vi.fn<AuthGateway['deleteUser']>(),
  };
  const attempts = failedAttempts({ max: 2, windowMs: 60_000 });
  return { gateway, attempts, reset: makePasswordReset({ gateway, attempts }) };
}

describe('makePasswordReset', () => {
  it('normaliza el email (espacios y mayúsculas) para Auth y para contar intentos', async () => {
    const { gateway, reset } = armar();
    await reset.forgot('  Ana@Mail.com ');
    await reset.reset(' ANA@mail.com', '123456', 'nueva-clave');
    expect(gateway.sendPasswordResetCode).toHaveBeenCalledWith('ana@mail.com');
    expect(gateway.resetPassword).toHaveBeenCalledWith('ana@mail.com', '123456', 'nueva-clave');
  });

  it('con demasiados códigos fallidos para ese email, ni consulta a Auth', async () => {
    const { gateway, reset } = armar('invalid_code');
    expect(await reset.reset('ana@mail.com', '111111', 'nueva-clave')).toBe('invalid_code');
    expect(await reset.reset('ANA@mail.com', '222222', 'nueva-clave')).toBe('invalid_code');
    const bloqueado = await reset.reset('ana@mail.com', '333333', 'nueva-clave');
    expect(bloqueado).toMatchObject({ tooManyAttempts: expect.any(Number) });
    expect(gateway.resetPassword).toHaveBeenCalledTimes(2);
    // Otro email no se ve afectado.
    expect(await reset.reset('otra@mail.com', '333333', 'nueva-clave')).toBe('invalid_code');
  });

  it('un cambio exitoso limpia los fallos; las contraseñas rechazadas no cuentan como fallo', async () => {
    const { gateway, reset, attempts } = armar('invalid_code');
    await reset.reset('ana@mail.com', '111111', 'nueva-clave');
    gateway.resetPassword.mockResolvedValue('ok');
    await reset.reset('ana@mail.com', '222222', 'nueva-clave');
    expect(attempts.blockedFor('ana@mail.com')).toBe(0);

    gateway.resetPassword.mockResolvedValue('same_password');
    for (let i = 0; i < 3; i++) await reset.reset('ana@mail.com', '222222', 'nueva-clave');
    expect(attempts.blockedFor('ana@mail.com')).toBe(0);
  });
});
