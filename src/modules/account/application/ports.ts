/** Supabase Auth respondió con error. Una excepción de red se propaga (500). */
export class DeleteUserError extends Error {}

export interface AuthAdmin {
  /** Borra el usuario de Supabase Auth; la base borra en cascada lo que
   *  cuelga de él (guardados, historial, perfil). Si Supabase responde con
   *  error → lanza `DeleteUserError` con su mensaje. */
  deleteUser(userId: string): Promise<void>;
}
