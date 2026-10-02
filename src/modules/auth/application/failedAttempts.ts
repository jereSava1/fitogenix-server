// Intentos fallidos por clave (el email) en una ventana: frena la fuerza bruta contra un código
// de pocos dígitos aunque venga de muchas IPs (D-48). En memoria, como el rate limit general.

export interface FailedAttempts {
  /** Segundos hasta poder reintentar; 0 si no está bloqueada. */
  blockedFor(key: string): number;
  fail(key: string): void;
  clear(key: string): void;
}

export function failedAttempts(opts: { max: number; windowMs: number; now?: () => number }): FailedAttempts {
  const now = opts.now ?? Date.now;
  const fails = new Map<string, number[]>();

  const recent = (key: string): number[] => {
    const since = now() - opts.windowMs;
    const kept = (fails.get(key) ?? []).filter((at) => at > since);
    if (kept.length > 0) fails.set(key, kept);
    else fails.delete(key);
    return kept;
  };

  return {
    blockedFor(key) {
      const kept = recent(key);
      if (kept.length < opts.max) return 0;
      return Math.ceil((kept[0]! + opts.windowMs - now()) / 1000);
    },
    fail(key) {
      fails.set(key, [...recent(key), now()]);
    },
    clear(key) {
      fails.delete(key);
    },
  };
}
