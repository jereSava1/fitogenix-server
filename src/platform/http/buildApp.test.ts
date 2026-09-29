/* M-02 · La app base (buildApp): fija lo que hoy hace main.ts antes de
 * registrar las rutas de negocio. CORS abierto y rate limit en memoria se
 * revisan en H-03. K-03 arregló el status del rate limit (429, antes 500) y
 * sumó el formato único de errores. */
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

  // CARACTERIZA: comportamiento actual, cambia en H-03 (CORS con lista
  // explícita, o deshabilitado: la app nativa no lo necesita).
  it('CORS refleja cualquier origen', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://cualquiera.test' } });
    expect(res.headers['access-control-allow-origin']).toBe('https://cualquiera.test');
  });

  // Hasta K-03 salía **500**: `errorResponseBuilder` devolvía un objeto sin
  // `statusCode` y Fastify lo trataba como error interno (caracterizado acá en
  // M-02).
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
