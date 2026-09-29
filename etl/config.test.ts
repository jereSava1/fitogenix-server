/* C-03 · El ETL falla con un mensaje claro si necesita ANTHROPIC_API_KEY y no
 * está (D-05). Los dos casos estaban en src/platform/config.test.ts; se
 * mudaron sin cambios en M-08, cuando la key pasó a la config propia del ETL.
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
});
