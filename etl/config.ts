// Config del ETL: Supabase se exige al cargar; ANTHROPIC_API_KEY solo cuando se usa
// la limpieza con IA (`requireAnthropicApiKey`).

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
    throw new Error('Missing required env var: ANTHROPIC_API_KEY (lo usa la limpieza con IA del ETL)');
  }
  return config.anthropicApiKey;
}
