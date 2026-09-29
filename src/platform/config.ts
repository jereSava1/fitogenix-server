const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key: string): string | undefined => process.env[key];

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // ANTHROPIC_API_KEY no está: solo la usa el ETL, que tiene su config propia
  // (etl/config.ts, M-08; D-05).
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  upstashRedisUrl: optional('UPSTASH_REDIS_REST_URL'),
  upstashRedisToken: optional('UPSTASH_REDIS_REST_TOKEN'),
};
