/* Config del ETL (ADR-0004, D-05): exige solo lo que usa el pipeline.
 *
 * Mismo criterio que `src/platform/config.ts`, pero para el proceso del ETL:
 * las credenciales de Supabase se exigen al cargar, y ANTHROPIC_API_KEY solo
 * la pide el enriquecimiento con IA cuando la usa (`requireAnthropicApiKey`).
 * Hasta M-08 el ETL leía la config del server; ahora cada proceso tiene la
 * suya y el server ya no conoce la key de Anthropic.
 */

const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key: string): string | undefined => process.env[key];

export const config = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  // Solo la usa el enriquecimiento con IA: los jobs que no la usan corren sin
  // ella. Quien la use la pide con requireAnthropicApiKey().
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
};

export function requireAnthropicApiKey(): string {
  if (!config.anthropicApiKey) {
    throw new Error('Missing required env var: ANTHROPIC_API_KEY (lo usa el ETL de enriquecimiento con IA)');
  }
  return config.anthropicApiKey;
}
