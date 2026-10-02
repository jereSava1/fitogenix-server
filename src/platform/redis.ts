import { Redis } from '@upstash/redis';
import { config } from './config';

/** Redis es opcional: si no responde en este tope, se sigue sin él (ADR-0006). */
export const REDIS_TIMEOUT_MS = 200;

// Cliente de Upstash compartido. Si faltan UPSTASH_REDIS_REST_URL / TOKEN
// devuelve null y quien lo usa hace no-op: el server corre sin Redis.
let _redis: Redis | null | undefined = undefined; // undefined = todavía no se miró

export function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;

  if (config.upstashRedisUrl && config.upstashRedisToken) {
    _redis = new Redis({
      url: config.upstashRedisUrl,
      token: config.upstashRedisToken,
      // Sin reintentos: con backoff, una caída costaba segundos por request.
      retry: false,
      signal: () => AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
  } else {
    _redis = null;
  }

  return _redis;
}

/** La operación, o un rechazo si tarda más que `REDIS_TIMEOUT_MS`. */
export async function withRedisTimeout<T>(op: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis no respondió en ${REDIS_TIMEOUT_MS} ms`)), REDIS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([op, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
