import { beforeAll, describe, expect, it } from 'vitest';
import type { FitogenixProduct } from '../types/fitogenix';

// config.ts valida env vars requeridas al importarse. Seteamos las mínimas
// (Supabase/Anthropic/SerpApi) pero DEJAMOS SIN setear las de Upstash Redis,
// así probamos el modo "Redis no configurado" (no-op / null).
type RedisModule = typeof import('./redisService');
let redis: RedisModule;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = await import('./redisService');
});

describe('redisService sin Redis configurado', () => {
  it('getFromRedis devuelve null (no-op)', async () => {
    await expect(redis.getFromRedis('7790001')).resolves.toBeNull();
  });

  it('setInRedis es no-op y no lanza', async () => {
    const product = { id: 'x', name: 'X' } as unknown as FitogenixProduct;
    await expect(redis.setInRedis('7790001', product)).resolves.toBeUndefined();
  });

  it('getSearchBarcode devuelve null (no-op)', async () => {
    await expect(redis.getSearchBarcode('coca cola')).resolves.toBeNull();
  });

  it('setSearchBarcode es no-op y no lanza', async () => {
    await expect(redis.setSearchBarcode('coca cola', '7790001')).resolves.toBeUndefined();
  });
});
