import { describe, expect, it } from 'vitest';
import { failedAttempts } from './failedAttempts';

function reloj() {
  let t = 1_000_000;
  return { now: () => t, avanzar: (ms: number) => (t += ms) };
}

describe('failedAttempts (D-48)', () => {
  it('bloquea al llegar al máximo dentro de la ventana, con los segundos que faltan', () => {
    const r = reloj();
    const intentos = failedAttempts({ max: 3, windowMs: 60_000, now: r.now });
    intentos.fail('a');
    r.avanzar(10_000);
    intentos.fail('a');
    expect(intentos.blockedFor('a')).toBe(0);
    intentos.fail('a');
    expect(intentos.blockedFor('a')).toBe(50); // el primero vence a los 60 s
    expect(intentos.blockedFor('b')).toBe(0);
  });

  it('los fallos viejos salen de la ventana', () => {
    const r = reloj();
    const intentos = failedAttempts({ max: 2, windowMs: 60_000, now: r.now });
    intentos.fail('a');
    intentos.fail('a');
    expect(intentos.blockedFor('a')).toBeGreaterThan(0);
    r.avanzar(60_001);
    expect(intentos.blockedFor('a')).toBe(0);
  });

  it('clear borra los fallos de esa clave', () => {
    const intentos = failedAttempts({ max: 1, windowMs: 60_000 });
    intentos.fail('a');
    expect(intentos.blockedFor('a')).toBeGreaterThan(0);
    intentos.clear('a');
    expect(intentos.blockedFor('a')).toBe(0);
  });
});
