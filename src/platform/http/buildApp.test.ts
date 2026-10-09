// La app base: CORS, rate limit, errores y /health, antes de las rutas de negocio.
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LOG_REDACT } from '../logger';
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

  it('sin orígenes configurados no hay CORS: ningún origen recibe permiso', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://cualquiera.test' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('el preflight permite los métodos que usa la API (PUT, PATCH y DELETE)', async () => {
    app = await buildApp({}, { corsOrigins: ['https://app.fitogenix.test'] });
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'https://app.fitogenix.test', 'access-control-request-method': 'DELETE' },
    });
    const allowed = String(res.headers['access-control-allow-methods']);
    for (const method of ['GET', 'PUT', 'PATCH', 'POST', 'DELETE']) expect(allowed).toContain(method);
  });

  it('con lista, solo esos orígenes (también en el preflight)', async () => {
    app = await buildApp({}, { corsOrigins: ['https://app.fitogenix.test'] });
    const permitido = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://app.fitogenix.test' } });
    expect(permitido.headers['access-control-allow-origin']).toBe('https://app.fitogenix.test');

    const otro = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'https://cualquiera.test', 'access-control-request-method': 'GET' },
    });
    expect(otro.headers['access-control-allow-origin']).toBeUndefined();
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

  // H-06: se confía en el proxy por su dirección (la de Render es 10.x), no por cantidad de saltos.
  const RENDER = '10.235.24.249';

  it('detrás de un proxy confiable, el límite es por cliente y no por la IP del proxy', async () => {
    app = await buildApp({ trustProxy: ['10.0.0.0/8'] });
    const desde = (ip: string) =>
      app!.inject({ method: 'GET', url: '/health', remoteAddress: RENDER, headers: { 'x-forwarded-for': ip } });
    for (let i = 0; i < 60; i++) expect((await desde('203.0.113.1')).statusCode).toBe(200);
    expect((await desde('203.0.113.1')).statusCode).toBe(429);
    expect((await desde('203.0.113.2')).statusCode).toBe(200);
  });

  it('quien llega directo (sin pasar por el proxy) no puede cambiar su IP con X-Forwarded-For', async () => {
    app = await buildApp({ trustProxy: ['10.0.0.0/8'] });
    const falsa = (i: number) =>
      app!.inject({
        method: 'GET', url: '/health', remoteAddress: '198.51.100.7', headers: { 'x-forwarded-for': `203.0.113.${i}` },
      });
    for (let i = 0; i < 60; i++) expect((await falsa(i)).statusCode).toBe(200);
    expect((await falsa(99)).statusCode).toBe(429);
  });

  it.each([
    ['por el proxy', RENDER, '203.0.113.9', '203.0.113.9'],
    ['por el proxy, con una IP falsa adelante', RENDER, '6.6.6.6, 203.0.113.9', '203.0.113.9'],
    ['directo, con una IP falsa', '198.51.100.7', '203.0.113.9', '198.51.100.7'],
  ])('request.ip %s → la del cliente real', async (_caso, remoteAddress, forwardedFor, esperada) => {
    app = await buildApp({ trustProxy: ['10.0.0.0/8'] });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    const res = await app.inject({ method: 'GET', url: '/ip', remoteAddress, headers: { 'x-forwarded-for': forwardedFor } });
    expect(res.json()).toEqual({ ip: esperada });
  });

  it('un valor inválido en TRUST_PROXY no arranca', async () => {
    await expect(buildApp({ trustProxy: ['no-es-una-ip'] })).rejects.toThrow();
  });

  it('los logs no llevan el token ni las cookies', async () => {
    const lineas: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        lineas.push(String(chunk));
        done();
      },
    });
    app = await buildApp({ logger: { stream, redact: LOG_REDACT } });
    app.get('/eco', async (request) => {
      request.log.info({ headers: request.headers }, 'headers de la request');
      return { ok: true };
    });
    await app.inject({ method: 'GET', url: '/eco', headers: { authorization: 'Bearer secreto-123', cookie: 'sid=abc' } });

    const log = lineas.join('');
    expect(log).toContain('headers de la request');
    expect(log).not.toContain('secreto-123');
    expect(log).not.toContain('sid=abc');
  });

  it('sin rutas de negocio: /v1/products/lookup no existe en la app base', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/products/lookup', payload: { query: 'x' } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'La ruta no existe.', code: 'NOT_FOUND' });
  });
});
