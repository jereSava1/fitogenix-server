// API pública de auth (ADR-0010): registro y recuperar la contraseña.

import type { FastifyInstance } from 'fastify';
import { failedAttempts } from './application/failedAttempts';
import type { SignUpProfiles } from './application/ports';
import { makePasswordReset } from './application/resetPassword';
import { makeSignUp } from './application/signUp';
import { supabaseAuthGateway } from './infrastructure/supabaseAuthGateway';
import { addSharedSchemas } from '../../platform/http/schemas';
import { passwordRoutes, passwordSharedSchemas } from './routes/password.route';
import { signUpRoutes, signUpSharedSchemas } from './routes/signup.route';

/** D-48: 5 códigos fallidos por email cada 15 minutos. */
const RESET_ATTEMPTS = { max: 5, windowMs: 15 * 60_000 };

export async function registerAuth(app: FastifyInstance, deps: { profiles: SignUpProfiles }): Promise<void> {
  // En la raíz, para que el OpenAPI los tenga como componentes (ADR-0011).
  addSharedSchemas(app, [...passwordSharedSchemas, ...signUpSharedSchemas]);
  const passwordReset = makePasswordReset({
    gateway: supabaseAuthGateway,
    attempts: failedAttempts(RESET_ATTEMPTS),
  });
  await app.register(passwordRoutes({ passwordReset }));
  await app.register(signUpRoutes({ signUp: makeSignUp({ gateway: supabaseAuthGateway, profiles: deps.profiles }) }));
}
