// Una dependencia (la base, Auth, Redis) no respondió o falló (ADR-0006). Nunca significa
// "no está": eso es un resultado (`null`) de una consulta que salió bien.

export type Dependency = 'supabase' | 'auth' | 'redis';

export class DependencyUnavailableError extends Error {
  constructor(
    readonly dependency: Dependency,
    detail: string,
    options?: { cause?: unknown },
  ) {
    super(`${dependency} no disponible: ${detail}`, options);
    this.name = 'DependencyUnavailableError';
  }
}
