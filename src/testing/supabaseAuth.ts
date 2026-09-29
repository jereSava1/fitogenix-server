// Supabase Auth simulado para tests: un par de claves ES256 propio, su JWKS servido por un
// `fetch` falso (nada sale a la red) y access tokens con los claims que emite Supabase.

import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';

export const SUPABASE_URL = 'https://test.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const KID = 'clave-de-test';

/** Cómo contesta el JWKS: bien, error de red, 500, algo que no es un JWKS o timeout. */
type EstadoJwks = 'ok' | 'caido' | 'error-500' | 'invalido' | 'timeout';

export type SupabaseAuthSimulado = Awaited<ReturnType<typeof simularSupabaseAuth>>;

export async function simularSupabaseAuth() {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: 'ES256', use: 'sig' };
  let estado: EstadoJwks = 'ok';
  let pedidos = 0;

  const fetchFalso: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== JWKS_URL) throw new Error(`fetch inesperado en un test: ${url}`);
    pedidos++;
    switch (estado) {
      case 'caido':
        throw new TypeError('fetch failed');
      case 'timeout':
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      case 'error-500':
        return new Response('boom', { status: 500 });
      case 'invalido':
        return Response.json({ nada: true });
      default:
        return Response.json({ keys: [jwk] });
    }
  };

  return {
    /** Para `vi.stubGlobal('fetch', …)`: solo contesta el JWKS del proyecto de test. */
    fetch: fetchFalso,
    /** Cambia cómo contesta el JWKS de acá en adelante. */
    jwks(nuevo: EstadoJwks) {
      estado = nuevo;
    },
    /** Cuántas veces se pidió el JWKS. */
    get pedidos() {
      return pedidos;
    },
    /** Access token de `sub`, vigente 1 h. `cambios` pisa claims (con `undefined` se sacan);
     *  `firma` cambia la clave, el `kid` o el algoritmo. */
    token(
      sub: string,
      cambios: JWTPayload = {},
      firma: { clave?: CryptoKey | Uint8Array; kid?: string; alg?: string } = {},
    ): Promise<string> {
      const ahora = Math.floor(Date.now() / 1000);
      return new SignJWT({
        iss: ISSUER,
        aud: 'authenticated',
        sub,
        role: 'authenticated',
        iat: ahora,
        exp: ahora + 3600,
        ...cambios,
      })
        .setProtectedHeader({ alg: firma.alg ?? 'ES256', kid: firma.kid ?? KID, typ: 'JWT' })
        .sign(firma.clave ?? privateKey);
    },
  };
}
