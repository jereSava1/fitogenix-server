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
  // Direcciones de los proxies delante del server (IPs, CIDR o nombres de `proxy-addr`; en Render,
  // 10.0.0.0/8). Sin esto el rate limit por IP ve la del proxy y todos comparten el contador.
  trustProxy: list('TRUST_PROXY'),
  // ANTHROPIC_API_KEY no: solo la usa el ETL (etl/config.ts).
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  upstashRedisUrl: optional('UPSTASH_REDIS_REST_URL'),
  upstashRedisToken: optional('UPSTASH_REDIS_REST_TOKEN'),
};
