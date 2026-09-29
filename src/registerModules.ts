/* Registra las rutas de todos los módulos en la app base. Lo usan `main.ts`
 * (el server) y `scripts/generate-contract.ts` (el OpenAPI), así los dos arman
 * exactamente la misma superficie HTTP (ADR-0011, K-01).
 */

import type { FastifyInstance } from 'fastify';
import { resolveUserIdFromToken } from './platform/http/auth';
import { registerCatalog } from './modules/catalog';
import { recordScan, registerUserLibrary } from './modules/user-library';
import { registerAccount } from './modules/account';

export async function registerModules(app: FastifyInstance): Promise<void> {
  // El registro del escaneo se inyecta en catalog (02-arquitectura §3.3): el
  // usuario se resuelve desde el token y el escaneo va al historial de
  // user-library. catalog no conoce a user-library.
  await registerCatalog(app, {
    onScan: async ({ token, productId }) => {
      const userId = await resolveUserIdFromToken(token);
      if (userId) await recordScan(userId, productId);
    },
  });
  await registerAccount(app);
  await registerUserLibrary(app);
}
