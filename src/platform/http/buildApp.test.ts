// La app base: CORS, rate limit, errores y /health, antes de las rutas de negocio.
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp';

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

describe('buildApp (M-02)', () => {
  it('GET /health → 200 con { ok: true, ts }', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, ts: expect.any(Number) });
  });

  // CARACTERIZA: cambia en H-03 (CORS con lista explícita o deshabilitado).
  it('CORS refleja cualquier origen', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://cualquiera.test' } });
    expect(res.headers['access-control-allow-origin']).toBe('https://cualquiera.test');
  });

  it('rate limit global: la request 61 del minuto → 429 RATE_LIMITED con retry-after', async () => {
    app = await buildApp();
    for (let i = 0; i < 60; i++) {
      const ok = await app.inject({ method: 'GET', url: '/health' });
      expect(ok.statusCode).toBe(200);
    }
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      error: 'Demasiadas solicitudes. Intentá de nuevo en un momento.',
      code: 'RATE_LIMITED',
    });
    expect(res.headers['retry-after']).toBe('60');
  });

  it('sin rutas de negocio: /v1/products/lookup no existe en la app base', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/products/lookup', payload: { query: 'x' } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'La ruta no existe.', code: 'NOT_FOUND' });
  });
});
