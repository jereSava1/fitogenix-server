// Sesión: el access token de Supabase se verifica localmente con el JWKS del proyecto (firma,
// `exp`, `iss`, `aud`; ADR-0008). requireAuth y optionalAuth comparten la verificación.

import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { createLocalJWKSet, createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { config } from '../config';
import { DependencyUnavailableError } from '../dependencyError';
import { SUPABASE_TIMEOUT_MS, supabaseAdmin } from '../supabase';
import { apiError } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

const AUDIENCE = 'authenticated';
/** Solo asimétricos (ADR-0008): la clave vigente es ECC P-256. */
const ALGORITHMS = ['ES256', 'RS256'];

/** `Authorization: Bearer <token>`, sin distinguir mayúsculas; cualquier otra forma → null (D-75). */
function bearerToken(header: string | undefined): string | null {
  return /^bearer\s+(.+)$/i.exec((header ?? '').trim())?.[1] ?? null;
}

/** No se pudo traer el JWKS (red, timeout, respuesta que no es un JWKS): no dice nada del token. */
function isJwksFetchFailure(err: unknown): boolean {
  if (!(err instanceof errors.JOSEError)) return true;
  return err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid || err.code === 'ERR_JOSE_GENERIC';
}

/** Claves públicas en memoria; jose las refresca cada 10 min. Si Auth no responde se siguen
 *  usando las últimas; sin ninguna, 503 (ADR-0006). */
function supabaseKeys(jwksUrl: URL): JWTVerifyGetKey {
  const remote = createRemoteJWKSet(jwksUrl, { timeoutDuration: SUPABASE_TIMEOUT_MS });
  return async (header, token) => {
    try {
      return await remote(header, token);
    } catch (err) {
      if (!isJwksFetchFailure(err)) throw err;
      const cached = remote.jwks();
      const key = cached && (await createLocalJWKSet(cached)(header, token).catch(() => null));
      if (key) return key;
      throw new DependencyUnavailableError('auth', 'no se pudo obtener el JWKS', { cause: err });
    }
  };
}

let keys: JWTVerifyGetKey | undefined;

/** El usuario (`sub`) si el token es válido; null si no. Sin claves para verificarlo, lanza
 *  DependencyUnavailableError. */
async function verifyAccessToken(token: string): Promise<string | null> {
  const issuer = `${config.supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
  keys ??= supabaseKeys(new URL(`${issuer}/.well-known/jwks.json`));
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: AUDIENCE,
      algorithms: ALGORITHMS,
      requiredClaims: ['exp', 'sub'],
    });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch (err) {
    if (err instanceof DependencyUnavailableError) throw err;
    return null;
  }
}

/** Supabase Auth confirma que la sesión sigue activa: una revocada conserva un JWT vigente
 *  hasta que vence. Solo un 4xx dice que no; red, timeout o 5xx son Auth caído (D-75). */
async function sessionIsActive(token: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .auth.getUser(token)
    .catch((err: unknown) => {
      throw new DependencyUnavailableError('auth', 'getUser', { cause: err });
    });
  if (error && !(error.status && error.status >= 400 && error.status < 500)) {
    throw new DependencyUnavailableError('auth', `getUser: ${error.message}`, { cause: error });
  }
  return !error && data.user?.id === userId;
}

/** Exige sesión y deja `request.userId`. Se registra en el contexto de cada módulo de rutas;
 *  `checkSession` suma la consulta a Supabase Auth para operaciones sensibles (ADR-0008). */
export const requireAuth = fp<{ checkSession?: boolean }>(
  async (app, opts) => {
    app.addHook('onRequest', async (request, reply) => {
      const token = bearerToken(request.headers.authorization);
      if (!token) {
        return reply.status(401).send(apiError('UNAUTHENTICATED', 'Falta el token de sesión'));
      }

      const userId = await verifyAccessToken(token);
      if (!userId || (opts.checkSession && !(await sessionIsActive(token, userId)))) {
        return reply.status(401).send(apiError('UNAUTHENTICATED', 'Sesión inválida o expirada'));
      }

      request.userId = userId;
    });
  },
  { name: 'fitogenix-auth', fastify: '5.x' },
);

/** El token de la request, para las rutas que lo pasan a Supabase (p. ej. cerrar sesión). */
export function accessTokenOf(request: FastifyRequest): string | null {
  return bearerToken(request.headers.authorization);
}

/** Sesión opcional: el usuario si el token es válido; si no vino, no sirve o no se puede
 *  verificar, null y la request sigue como anónima (ADR-0006, D-75). */
export async function optionalAuth(request: FastifyRequest): Promise<string | null> {
  const token = bearerToken(request.headers.authorization);
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch (err) {
    request.log.warn({ err }, 'No se pudo verificar el token; la request sigue como anónima');
    return null;
  }
}
