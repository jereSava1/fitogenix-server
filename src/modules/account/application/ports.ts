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

/** El perfil que arma el registro: todos los campos. */
export type NewProfile = Record<keyof Profile, string>;

/** `exists`: el usuario ya tenía perfil (se registró antes y no confirmó): no se toca. */
export type CreateProfileResult = 'created' | 'exists' | 'username_taken';

export interface ProfileRepository {
  /** La fila del usuario; `null` si no tiene. Una falla de la base lanza (503). */
  get(userId: string): Promise<Profile | null>;
  /** Cambia solo los campos que vienen. `username_taken` si el username ya es de otro
   *  (índice único sobre `lower(username)`); `not_found` si no hay fila. */
  update(userId: string, changes: ProfileChanges): Promise<UpdateProfileResult>;
  /** Sin distinguir mayúsculas. */
  isUsernameTaken(username: string): Promise<boolean>;
  /** Crea la fila del usuario recién registrado. Una fila sin username (la del trigger
   *  `handle_new_user`, o un registro que no terminó) se completa. */
  create(userId: string, profile: NewProfile): Promise<CreateProfileResult>;
}

// Onboarding (RF-048): claves estables; la app mapea sus etiquetas.
export const GOALS = { healthier: true, toxins: true, condition: true, energy: true, family: true, weight: true } as const;
export const SYMPTOMS = { energy: true, fog: true, digestion: true, skin: true, sleep: true, weight: true } as const;
export const DIETS = {
  none: true, gluten_free: true, paleo: true, carnivore: true, vegetarian: true,
  pescatarian: true, kosher: true, dairy_free: true, vegan: true,
} as const;
export const ALLERGIES = {
  none: true, peanut: true, tree_nuts: true, dairy: true, egg: true, soy: true, shellfish: true, gluten: true,
} as const;
export const AVOID = { seedoils: true, sweeteners: true, dyes: true, metals: true, preservatives: true, sugar: true } as const;
export const SOURCES = {
  instagram: true, tiktok: true, friend: true, podcast: true, doctor: true, appstore: true, other: true,
} as const;

export interface OnboardingAnswers {
  goals: (keyof typeof GOALS)[];
  symptoms: (keyof typeof SYMPTOMS)[];
  diets: (keyof typeof DIETS)[];
  allergies: (keyof typeof ALLERGIES)[];
  avoid: (keyof typeof AVOID)[];
  source: keyof typeof SOURCES | null;
}

/** Solo existe si la persona aceptó; sin consentimiento no se manda. */
export interface OnboardingConsent {
  healthData: true;
  textVersion: string;
}

/** Consentimiento para los datos de salud del onboarding (RNF-S10), como se guarda. */
export interface HealthDataConsent {
  at: Date;
  textVersion: string;
}

export interface OnboardingRepository {
  /** Una fila por usuario: la reemplaza si ya había. `consent` null = sin consentimiento.
   *  Una falla de la base lanza (503). */
  save(userId: string, answers: OnboardingAnswers, consent: HealthDataConsent | null): Promise<void>;
}
