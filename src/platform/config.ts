const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key: string): string | undefined => process.env[key];

/** "a, b" → ['a', 'b']; vacía o ausente → []. */
const list = (key: string): string[] =>
  (process.env[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Orígenes web con CORS; vacío = sin CORS (la app nativa no lo usa).
  corsOrigins: list('CORS_ORIGINS'),
  // Proxies delante del server (en Render, su balanceador): sin esto el rate limit por IP
  // ve la IP del proxy y todos los clientes comparten el mismo contador.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
  // ANTHROPIC_API_KEY no: solo la usa el ETL (etl/config.ts).
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  upstashRedisUrl: optional('UPSTASH_REDIS_REST_URL'),
  upstashRedisToken: optional('UPSTASH_REDIS_REST_TOKEN'),
};
