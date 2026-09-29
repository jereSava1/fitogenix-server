// `/health/ready`: Supabase decide si está listo; Redis solo se informa.
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ReadinessChecks } from './health';

let registerReadiness: typeof import('./health').registerReadiness;
let app: FastifyInstance | null = null;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ registerReadiness } = await import('./health'));
});

afterEach(async () => {
  await app?.close();
  app = null;
});

async function ready(checks: ReadinessChecks) {
  app = Fastify();
  registerReadiness(app, checks);
  return app.inject({ method: 'GET', url: '/health/ready' });
}

describe('/health/ready', () => {
  it('Supabase responde → 200, con el estado de Redis', async () => {
    const res = await ready({ supabase: async () => {}, redis: async () => 'up' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, supabase: 'up', redis: 'up' });
  });

  it('Redis caído o sin configurar no lo vuelve \"no listo\"', async () => {
    const caido = await ready({ supabase: async () => {}, redis: async () => 'down' });
    expect(caido.statusCode).toBe(200);
    expect(caido.json()).toMatchObject({ redis: 'down' });
    await app!.close();

    const sinRedis = await ready({ supabase: async () => {}, redis: async () => 'disabled' });
    expect(sinRedis.json()).toMatchObject({ ok: true, redis: 'disabled' });
  });

  it('Supabase no responde → 503', async () => {
    const res = await ready({
      supabase: async () => {
        throw new Error('timeout');
      },
      redis: async () => 'up',
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, supabase: 'down', redis: 'up' });
  });
});
