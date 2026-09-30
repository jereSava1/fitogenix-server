import { describe, expect, it, vi } from 'vitest';
import { failedAttempts } from './failedAttempts';
import type { ResetPasswordResult } from './ports';
import { makePasswordReset } from './resetPassword';
import { fakeGateway } from '../testing/fakes';

const IP = '203.0.113.7';

function armar(resultado: ResetPasswordResult = 'ok') {
  const gateway = fakeGateway();
  gateway.resetPassword.mockResolvedValue(resultado);
  const attempts = failedAttempts({ max: 2, windowMs: 60_000 });
  return { gateway, attempts, reset: makePasswordReset({ gateway, attempts }) };
}

describe('makePasswordReset', () => {
  it('normaliza el email (espacios y mayúsculas) para Auth y para contar intentos', async () => {
    const { gateway, reset } = armar();
    await reset.forgot('  Ana@Mail.com ', IP);
    await reset.reset(' ANA@mail.com', '123456', 'nueva-clave', IP);
    expect(gateway.sendPasswordResetCode).toHaveBeenCalledWith('ana@mail.com', IP);
    expect(gateway.resetPassword).toHaveBeenCalledWith('ana@mail.com', '123456', 'nueva-clave', IP);
  });

  it('con demasiados códigos fallidos para ese email, ni consulta a Auth', async () => {
    const { gateway, reset } = armar('invalid_code');
    expect(await reset.reset('ana@mail.com', '111111', 'nueva-clave', IP)).toBe('invalid_code');
    expect(await reset.reset('ANA@mail.com', '222222', 'nueva-clave', IP)).toBe('invalid_code');
    const bloqueado = await reset.reset('ana@mail.com', '333333', 'nueva-clave', IP);
    expect(bloqueado).toMatchObject({ tooManyAttempts: expect.any(Number) });
    expect(gateway.resetPassword).toHaveBeenCalledTimes(2);
    // Otro email no se ve afectado.
    expect(await reset.reset('otra@mail.com', '333333', 'nueva-clave', IP)).toBe('invalid_code');
  });

  it('un cambio exitoso limpia los fallos; las contraseñas rechazadas no cuentan como fallo', async () => {
    const { gateway, reset, attempts } = armar('invalid_code');
    await reset.reset('ana@mail.com', '111111', 'nueva-clave', IP);
    gateway.resetPassword.mockResolvedValue('ok');
    await reset.reset('ana@mail.com', '222222', 'nueva-clave', IP);
    expect(attempts.blockedFor('ana@mail.com')).toBe(0);

    gateway.resetPassword.mockResolvedValue('same_password');
    for (let i = 0; i < 3; i++) await reset.reset('ana@mail.com', '222222', 'nueva-clave', IP);
    expect(attempts.blockedFor('ana@mail.com')).toBe(0);
  });
});
