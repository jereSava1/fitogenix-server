// Timeouts y error tipado de las dependencias (ADR-0006).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let supabase: typeof import('./supabase');
let redis: typeof import('./redis');

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  supabase = await import('./supabase');
  redis = await import('./redis');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchWithTimeout (Supabase, 2 s)', () => {
  it('aborta una request que no responde', async () => {
    vi.useFakeTimers();
    const colgada = vi.fn((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }),
    );
    const pedido = supabase.fetchWithTimeout(2000, colgada as typeof fetch)('https://x.test');
    const assertion = expect(pedido).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
  });

  it('respeta el signal que ya traía la request', async () => {
    const recibido = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      return new Response('ok');
    });
    const ctrl = new AbortController();
    ctrl.abort();
    await supabase.fetchWithTimeout(2000, recibido as typeof fetch)('https://x.test', { signal: ctrl.signal });
    expect(recibido).toHaveBeenCalledTimes(1);
  });
});

describe('runQuery / queryFailed', () => {
  it('una excepción de la consulta sale como DependencyUnavailableError', async () => {
    await expect(
      supabase.runQuery('products select', async () => {
        throw new TypeError('fetch failed');
      }),
    ).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
  });

  it('un resultado se devuelve tal cual; un `error` de PostgREST se traduce aparte', async () => {
    await expect(supabase.runQuery('x', async () => ({ data: 1, error: null }))).resolves.toEqual({ data: 1, error: null });
    expect(supabase.queryFailed('x', { message: 'boom' }).message).toBe('supabase no disponible: x: boom');
  });
});

describe('withRedisTimeout (200 ms)', () => {
  it('rechaza si Redis no responde a tiempo', async () => {
    vi.useFakeTimers();
    const assertion = expect(redis.withRedisTimeout(new Promise(() => {}))).rejects.toThrow('200 ms');
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
  });

  it('si responde antes, devuelve su valor', async () => {
    await expect(redis.withRedisTimeout(Promise.resolve('OK'))).resolves.toBe('OK');
  });
});
