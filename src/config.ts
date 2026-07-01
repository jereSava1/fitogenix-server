const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key: string): string | undefined => process.env[key];

export const config = {
  port: Number(process.env.PORT ?? 3000),
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  serpApiKey: required('SERPAPI_API_KEY'),
  removeBgApiKey: optional('REMOVE_BG_API_KEY'),
};
