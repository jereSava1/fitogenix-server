const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key: string): string | undefined => process.env[key];

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Solo lo usa el enriquecimiento con IA del ETL: el server no lo exige al
  // arrancar (D-05). Quien lo use lo pide con requireAnthropicApiKey().
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  upstashRedisUrl: optional('UPSTASH_REDIS_REST_URL'),
  upstashRedisToken: optional('UPSTASH_REDIS_REST_TOKEN'),
};

export function requireAnthropicApiKey(): string {
  if (!config.anthropicApiKey) {
    throw new Error('Missing required env var: ANTHROPIC_API_KEY (lo usa el ETL de enriquecimiento con IA)');
  }
  return config.anthropicApiKey;
}
