// API pública de auth (ADR-0010): sesión con cualquier proveedor, registro y recuperar la contraseña.

import type { FastifyInstance } from 'fastify';
import { failedAttempts } from './application/failedAttempts';
import type { AuthProfiles } from './application/ports';
import { makePasswordReset } from './application/resetPassword';
import { makeSessions } from './application/session';
import { makeSignUp } from './application/signUp';
import { supabaseAuthGateway as gateway } from './infrastructure/supabaseAuthGateway';
import { addSharedSchemas } from '../../platform/http/schemas';
import { passwordRoutes, passwordSharedSchemas } from './routes/password.route';
import { sessionRoutes, sessionSharedSchemas } from './routes/session.route';
import { signUpRoutes, signUpSharedSchemas } from './routes/signup.route';

/** D-48: 5 intentos fallidos por email cada 15 minutos (login y códigos de recuperación, cada uno el suyo). */
const FAILED_ATTEMPTS = { max: 5, windowMs: 15 * 60_000 };

export async function registerAuth(app: FastifyInstance, deps: { profiles: AuthProfiles }): Promise<void> {
  // En la raíz, para que el OpenAPI los tenga como componentes (ADR-0011).
  addSharedSchemas(app, [...passwordSharedSchemas, ...signUpSharedSchemas, ...sessionSharedSchemas]);
  const { profiles } = deps;
  await app.register(passwordRoutes({ passwordReset: makePasswordReset({ gateway, attempts: failedAttempts(FAILED_ATTEMPTS) }) }));
  await app.register(signUpRoutes({ signUp: makeSignUp({ gateway, profiles }) }));
  await app.register(sessionRoutes({ sessions: makeSessions({ gateway, profiles, attempts: failedAttempts(FAILED_ATTEMPTS) }) }));
}
