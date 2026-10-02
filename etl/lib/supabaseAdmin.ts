// Cliente Supabase con service role para el ETL (config propia: etl/config.ts).
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

let _admin: ReturnType<typeof createClient<any>> | null = null;
export const admin = (): ReturnType<typeof createClient<any>> => {
  if (!_admin) _admin = createClient(config.supabaseUrl, config.supabaseSecretKey);
  return _admin;
};
