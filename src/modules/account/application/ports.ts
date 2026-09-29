/* Puertos de account (docs/02-arquitectura.md §8.5, ADR-0002).
 *
 * Hoy el módulo solo elimina la cuenta (M-07). `ProfileRepository` y
 * `OnboardingRepository` llegan con F-05 y F-06.
 */

/** Supabase Auth respondió con un error al borrar (no una excepción de red:
 *  esas se propagan tal cual y Fastify responde su 500 genérico, como antes
 *  de M-07; H-01 unifica los errores). */
export class DeleteUserError extends Error {}

export interface AuthAdmin {
  /** Borra el usuario de Supabase Auth; la base borra en cascada lo que
   *  cuelga de él (guardados, historial, perfil). Si Supabase responde con
   *  error → lanza `DeleteUserError` con su mensaje. */
  deleteUser(userId: string): Promise<void>;
}
