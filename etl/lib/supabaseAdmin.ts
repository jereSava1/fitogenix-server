// Cliente Supabase con service role para el ETL (config propia: etl/config.ts).
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: ReturnType<typeof createClient<any>> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const admin = (): ReturnType<typeof createClient<any>> => {
  if (!_admin) _admin = createClient(config.supabaseUrl, config.supabaseSecretKey);
  return _admin;
};
