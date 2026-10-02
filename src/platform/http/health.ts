// Readiness (ADR-0006): `/health` dice que el proceso responde; `/health/ready`, que puede
// atender. Supabase es obligatoria (sin ella, 503); Redis es opcional y solo se informa.

import type { FastifyInstance } from 'fastify';
import { getRedis, withRedisTimeout } from '../redis';
import { queryFailed, runQuery, supabaseAdmin } from '../supabase';

export type RedisState = 'up' | 'down' | 'disabled';

export type ReadinessChecks = {
  /** Resuelve si la base responde; si no, lanza. */
  supabase: () => Promise<void>;
  redis: () => Promise<RedisState>;
};

const READY_TIMEOUT_MS = 1000;

export const realChecks: ReadinessChecks = {
  async supabase() {
    const { error } = await runQuery('ready', () =>
      supabaseAdmin()
        .from('products')
        .select('id')
        .retry(false)
        .limit(1)
        .abortSignal(AbortSignal.timeout(READY_TIMEOUT_MS)),
    );
    if (error) throw queryFailed('ready', error);
  },
  async redis() {
    const redis = getRedis();
    if (!redis) return 'disabled';
    try {
      await withRedisTimeout(redis.ping());
      return 'up';
    } catch {
      return 'down';
    }
  },
};

export function registerReadiness(app: FastifyInstance, checks: ReadinessChecks = realChecks): void {
  app.get('/health/ready', async (request, reply) => {
    const redis = await checks.redis();
    try {
      await checks.supabase();
      return { ok: true, supabase: 'up', redis };
    } catch (err) {
      request.log.warn({ err }, 'Readiness: Supabase no responde');
      return reply.status(503).send({ ok: false, supabase: 'down', redis });
    }
  });
}
