import { Redis } from '@upstash/redis';
import { config } from './config';

// Cliente de Upstash compartido. Si faltan UPSTASH_REDIS_REST_URL / TOKEN
// devuelve null y quien lo usa hace no-op: el server corre sin Redis.
let _redis: Redis | null | undefined = undefined; // undefined = todavía no se miró

export function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;

  if (config.upstashRedisUrl && config.upstashRedisToken) {
    _redis = new Redis({
      url: config.upstashRedisUrl,
      token: config.upstashRedisToken,
    });
  } else {
    _redis = null;
  }

  return _redis;
}
