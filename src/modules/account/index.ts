// API pública de account: el perfil y eliminar la cuenta.

import type { FastifyInstance } from 'fastify';
import { makeDeleteAccount } from './application/deleteAccount';
import { makeProfile } from './application/profile';
import { supabaseAuthAdmin } from './infrastructure/supabaseAuthAdmin';
import { supabaseProfileRepository } from './infrastructure/supabaseProfileRepository';
import { addSharedSchemas } from '../../platform/http/schemas';
import { accountSharedSchemas, deleteMeRoutes } from './routes/deleteMe.route';
import { profileRoutes, profileSharedSchemas } from './routes/profile.route';

export async function registerAccount(app: FastifyInstance): Promise<void> {
  // En la raíz, para que el OpenAPI los tenga como componentes (ADR-0011).
  addSharedSchemas(app, [...accountSharedSchemas, ...profileSharedSchemas]);
  await app.register(deleteMeRoutes({ deleteAccount: makeDeleteAccount(supabaseAuthAdmin) }));
  await app.register(profileRoutes({ profile: makeProfile(supabaseProfileRepository) }));
}
