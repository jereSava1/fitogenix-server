// Registra los módulos bajo /v1. Lo usan main.ts y el generador del OpenAPI, así los
// dos arman la misma superficie HTTP.

import type { FastifyInstance } from 'fastify';
import { resolveUserIdFromToken } from './platform/http/auth';
import { registerCatalog } from './modules/catalog';
import { recordScan, registerUserLibrary } from './modules/user-library';
import { registerAccount } from './modules/account';

/** Prefijo de todas las rutas del contrato (D-44). `/health` queda afuera; sin alias. */
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
