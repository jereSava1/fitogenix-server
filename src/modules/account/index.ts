/* API pública del módulo `account` (docs/02-arquitectura.md §8.5).
 *
 * Datos de la cuenta del usuario. Hoy: eliminar la cuenta (`DELETE /users/me`).
 * Perfil y onboarding llegan con F-05 y F-06. Acá se cablea el adaptador de
 * Supabase con el caso de uso y se registra la ruta (§3.2).
 */

import type { FastifyInstance } from 'fastify';
import { makeDeleteAccount } from './application/deleteAccount';
import { supabaseAuthAdmin } from './infrastructure/supabaseAuthAdmin';
import { deleteMeRoutes } from './routes/deleteMe.route';

export async function registerAccount(app: FastifyInstance): Promise<void> {
  await app.register(deleteMeRoutes({ deleteAccount: makeDeleteAccount(supabaseAuthAdmin) }));
}
