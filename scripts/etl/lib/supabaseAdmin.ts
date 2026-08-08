// Cliente Supabase con service role, compartido por todo el pipeline ETL.
// Mismo patrón lazy-singleton que cacheService.ts (src/services/cacheService.ts)
// — no lo reimplementamos distinto, solo vive acá porque scripts/etl/ está
// fuera de src/ (no se compila con el server, ver README de la carpeta).
import { createClient } from '@supabase/supabase-js';
import { config } from '../../../src/config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: ReturnType<typeof createClient<any>> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const admin = (): ReturnType<typeof createClient<any>> => {
  if (!_admin) _admin = createClient(config.supabaseUrl, config.supabaseSecretKey);
  return _admin;
};
