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

  it.each(['SUPABASE_URL', 'SUPABASE_SECRET_KEY'])('sin %s, la config no carga', async (key) => {
    vi.stubEnv(key, '');
    await expect(cargarConfig()).rejects.toThrow(`Missing required env var: ${key}`);
  });
});
