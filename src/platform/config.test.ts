/* C-03 · El server exige solo lo que usa (D-05, docs/05-plan.md).
 *
 * ANTHROPIC_API_KEY solo la usa el enriquecimiento con IA del ETL: el server
 * tiene que poder arrancar sin ella. Desde M-08 el server ni siquiera la lee;
 * que el ETL falle con un mensaje claro si la necesita lo fija
 * etl/config.test.ts. Cada caso importa config de cero (`vi.resetModules`)
 * porque se lee al importar el módulo.
 */
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
    // Desde M-08 el server ni siquiera la lee (antes: `anthropicApiKey` falsy).
    expect('anthropicApiKey' in config).toBe(false);
  });

  it.each(['SUPABASE_URL', 'SUPABASE_SECRET_KEY'])('sin %s, la config no carga', async (key) => {
    vi.stubEnv(key, '');
    await expect(cargarConfig()).rejects.toThrow(`Missing required env var: ${key}`);
  });
});
