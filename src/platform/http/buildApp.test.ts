/* M-02 · La app base (buildApp): fija lo que hoy hace main.ts antes de
 * registrar las rutas de negocio. Sin cambios de comportamiento: CORS abierto
 * y rate limit en memoria se revisan en H-03. */
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

  // CARACTERIZA: comportamiento actual, cambia en H-03. Pasado el límite, la
  // respuesta sale con **500** y no con 429: `errorResponseBuilder` devuelve un
  // objeto sin `statusCode`, y Fastify lo trata como error interno. El mensaje
  // y el `retry-after` sí salen bien.
  it('rate limit global: la request 61 del minuto → 500 (debería ser 429) con mensaje propio', async () => {
    app = await buildApp();
    for (let i = 0; i < 60; i++) {
      const ok = await app.inject({ method: 'GET', url: '/health' });
      expect(ok.statusCode).toBe(200);
    }
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Demasiadas solicitudes. Intentá de nuevo en un momento.' });
    expect(res.headers['retry-after']).toBe('60');
  });

  it('sin rutas de negocio: /products/lookup no existe en la app base', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/products/lookup', payload: { query: 'x' } });
    expect(res.statusCode).toBe(404);
  });
});
