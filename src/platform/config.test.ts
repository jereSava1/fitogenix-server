// El server arranca sin ANTHROPIC_API_KEY (solo la usa el ETL). La config se lee al
// importar: cada caso la importa de cero.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function cargarConfig() {
  vi.resetModules();
  return import('./config');
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('config (C-03)', () => {
  it('sin ANTHROPIC_API_KEY ni SERPAPI_API_KEY, la config del server carga', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('SERPAPI_API_KEY', '');
    const { config } = await cargarConfig();
    expect(config.supabaseUrl).toBe('https://test.supabase.co');
    expect('anthropicApiKey' in config).toBe(false);
  });

  it('CORS_ORIGINS y TRUST_PROXY separadas por comas; vacías, listas vacías', async () => {
    vi.stubEnv('CORS_ORIGINS', ' https://a.test , https://b.test ,');
    vi.stubEnv('TRUST_PROXY', ' 10.0.0.0/8 , loopback ');
    expect(await cargarConfig()).toMatchObject({
      config: { corsOrigins: ['https://a.test', 'https://b.test'], trustProxy: ['10.0.0.0/8', 'loopback'] },
    });

    vi.stubEnv('CORS_ORIGINS', '');
    vi.stubEnv('TRUST_PROXY', '');
    const { config } = await cargarConfig();
    expect(config.corsOrigins).toEqual([]);
    expect(config.trustProxy).toEqual([]);
  });

  it.each(['SUPABASE_URL', 'SUPABASE_SECRET_KEY'])('sin %s, la config no carga', async (key) => {
    vi.stubEnv(key, '');
    await expect(cargarConfig()).rejects.toThrow(`Missing required env var: ${key}`);
  });
});
