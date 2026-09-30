/** Supabase Auth respondió con error. Una excepción de red se propaga (500). */
export class DeleteUserError extends Error {}

export interface AuthAdmin {
  /** Borra el usuario de Supabase Auth; la base borra en cascada lo que
   *  cuelga de él (guardados, historial, perfil). Si Supabase responde con
   *  error → lanza `DeleteUserError` con su mensaje. */
  deleteUser(userId: string): Promise<void>;
}

/** Datos personales del usuario (`profiles`). Cualquiera puede faltar. */
export interface Profile {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
}

/** Lo que se puede cambiar: solo los campos que vienen, con las reglas del registro. */
export type ProfileChanges = Partial<Record<keyof Profile, string>>;

export type UpdateProfileResult = Profile | 'not_found' | 'username_taken';

export interface ProfileRepository {
  /** La fila del usuario; `null` si no tiene. Una falla de la base lanza (503). */
  get(userId: string): Promise<Profile | null>;
  /** Cambia solo los campos que vienen. `username_taken` si el username ya es de otro
   *  (índice único sobre `lower(username)`); `not_found` si no hay fila. */
  update(userId: string, changes: ProfileChanges): Promise<UpdateProfileResult>;
}
