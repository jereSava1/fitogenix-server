// API pública de account. Hoy: eliminar la cuenta.

import type { FastifyInstance } from 'fastify';
import { makeDeleteAccount } from './application/deleteAccount';
import { supabaseAuthAdmin } from './infrastructure/supabaseAuthAdmin';
import { addSharedSchemas } from '../../platform/http/schemas';
import { accountSharedSchemas, deleteMeRoutes } from './routes/deleteMe.route';

export async function registerAccount(app: FastifyInstance): Promise<void> {
  // En la raíz, para que el OpenAPI los tenga como componentes (ADR-0011).
  addSharedSchemas(app, accountSharedSchemas);
  await app.register(deleteMeRoutes({ deleteAccount: makeDeleteAccount(supabaseAuthAdmin) }));
}
