import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { DependencyUnavailableError } from './dependencyError';

/** Tope de cada request a Supabase (ADR-0006). Los SELECT además llevan `.retry(false)`:
 *  postgrest-js reintenta los GET hasta 3 veces con backoff y una caída tardaba ~15 s. */
export const SUPABASE_TIMEOUT_MS = 2000;

/** `fetch` que aborta a los `ms` (respetando el signal que ya traiga la request). */
export function fetchWithTimeout(ms: number, baseFetch: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return baseFetch(input, { ...init, signal });
  };
}

// Un solo cliente admin para todo el server: la secret key opera con el rol
// service_role y saltea RLS, así que cada consulta de datos de usuario filtra
// por user_id a mano (RNF-S03). Se crea la primera vez que se usa.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: ReturnType<typeof createClient<any>> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseAdmin(): ReturnType<typeof createClient<any>> {
  if (!_admin) {
    _admin = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      global: { fetch: fetchWithTimeout(SUPABASE_TIMEOUT_MS) },
    });
  }
  return _admin;
}

/** Cliente descartable para operaciones de Auth que abren una sesión de usuario (p. ej.
 *  `verifyOtp`). Nunca se hacen sobre `supabaseAdmin()`: su sesión pasaría a firmar las
 *  consultas siguientes como ese usuario. `clientIp` va en `Sb-Forwarded-For`: con la secret
 *  key, Supabase aplica sus límites por IP a la del usuario y no a la del server (D-30). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseAuthClient(clientIp: string): ReturnType<typeof createClient<any>> {
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout(SUPABASE_TIMEOUT_MS), headers: { 'Sb-Forwarded-For': clientIp } },
  });
}

/** Corre una consulta: si lanza (red, timeout), sale como DependencyUnavailableError. */
export async function runQuery<R>(what: string, run: () => PromiseLike<R>): Promise<R> {
  try {
    return await run();
  } catch (err) {
    throw new DependencyUnavailableError('supabase', what, { cause: err });
  }
}

/** Un `error` de PostgREST es una falla de la base, no un "no está". */
export function queryFailed(what: string, error: { message?: string }): DependencyUnavailableError {
  return new DependencyUnavailableError('supabase', `${what}: ${error.message ?? 'error'}`, { cause: error });
}
