/* C-03 · El server exige solo lo que usa (D-05, docs/05-plan.md).
 *
 * ANTHROPIC_API_KEY solo la usa el enriquecimiento con IA del ETL: el server
 * tiene que poder arrancar sin ella, y el ETL tiene que fallar con un mensaje
 * claro si la necesita y no está. Cada caso importa config de cero
 * (`vi.resetModules`) porque se lee al importar el módulo.
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
    expect(config.anthropicApiKey).toBeFalsy();
  });

  it('requireAnthropicApiKey falla con un mensaje claro si falta', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { requireAnthropicApiKey } = await cargarConfig();
    expect(() => requireAnthropicApiKey()).toThrow('Missing required env var: ANTHROPIC_API_KEY');
  });

  it('requireAnthropicApiKey devuelve la key si está', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const { requireAnthropicApiKey } = await cargarConfig();
    expect(requireAnthropicApiKey()).toBe('sk-test');
  });

  it.each(['SUPABASE_URL', 'SUPABASE_SECRET_KEY'])('sin %s, la config no carga', async (key) => {
    vi.stubEnv(key, '');
    await expect(cargarConfig()).rejects.toThrow(`Missing required env var: ${key}`);
  });
});
