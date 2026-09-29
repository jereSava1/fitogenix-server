import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// Un solo cliente admin para todo el server: la secret key opera con el rol
// service_role y saltea RLS, así que cada consulta de datos de usuario filtra
// por user_id a mano (RNF-S03). Se crea la primera vez que se usa.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: ReturnType<typeof createClient<any>> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseAdmin(): ReturnType<typeof createClient<any>> {
  if (!_admin) _admin = createClient(config.supabaseUrl, config.supabaseSecretKey);
  return _admin;
}
