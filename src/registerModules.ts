/* Registra las rutas de todos los módulos en la app base. Lo usan `main.ts`
 * (el server) y `scripts/generate-contract.ts` (el OpenAPI), así los dos arman
 * exactamente la misma superficie HTTP (ADR-0011, K-01), toda bajo `/v1`
 * (K-03).
 */

import type { FastifyInstance } from 'fastify';
import { resolveUserIdFromToken } from './platform/http/auth';
import { registerCatalog } from './modules/catalog';
import { recordScan, registerUserLibrary } from './modules/user-library';
import { registerAccount } from './modules/account';

/** Prefijo de versión de todas las rutas del contrato (D-44). `/health` queda
 *  afuera: la registra `buildApp` y no es parte del contrato con la app. Sin
 *  alias de las rutas viejas (D-57). */
export const API_PREFIX = '/v1';

export async function registerModules(app: FastifyInstance): Promise<void> {
  await app.register(
    async (v1) => {
      // El registro del escaneo se inyecta en catalog (02-arquitectura §3.3):
      // el usuario se resuelve desde el token y el escaneo va al historial de
      // user-library. catalog no conoce a user-library.
      await registerCatalog(v1, {
        onScan: async ({ token, productId }) => {
          const userId = await resolveUserIdFromToken(token);
          if (userId) await recordScan(userId, productId);
        },
      });
      await registerAccount(v1);
      await registerUserLibrary(v1);
    },
    { prefix: API_PREFIX },
  );
}
