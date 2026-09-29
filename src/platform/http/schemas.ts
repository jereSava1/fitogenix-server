/* Piezas compartidas del contrato HTTP (ADR-0011, K-01).
 *
 * Los schemas se escriben con TypeBox: de un solo lugar salen la validación
 * del request (ajv, el de Fastify por defecto), la serialización de la
 * respuesta (fast-json-stringify) y el OpenAPI (`npm run contract:generate`).
 *
 * Los schemas con `$id` se registran en la app (`addSharedSchemas`) y las rutas
 * los referencian con `Type.Ref`: así aparecen una sola vez en el OpenAPI, en
 * `components.schemas`, y native los recibe como tipos con nombre.
 */

import { Type, type Static, type TSchema } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

/**
 * `T | null` como `{ type: ['<tipo>', 'null'] }`, la forma que ya usaba el
 * schema escrito a mano. (`Type.Union` generaría un `anyOf` equivalente pero
 * distinto como JSON Schema.)
 */
export function Nullable<T extends TSchema>(schema: T) {
  // Por JSON para quedarse con el JSON Schema puro (sin los símbolos internos
  // de TypeBox, que son del tipo original).
  const { type, ...rest } = JSON.parse(JSON.stringify(schema)) as { type: string };
  return Type.Unsafe<T['static'] | null>({ ...rest, type: [type, 'null'] });
}

/**
 * Códigos de error del contrato (03-contratos §B.2). Solo los que el server
 * puede responder hoy: cada ítem que agrega un error nuevo suma su código acá
 * y en contract/CHANGELOG.md (`DEPENDENCY_UNAVAILABLE` con H-01, los de
 * `/auth/*` con F-02 y F-03).
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'PRODUCT_NOT_IN_CATALOG',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Formato ÚNICO de error en todos los endpoints (K-03): `error` es el mensaje
 * para mostrar, en español; `code` es estable, para que la app decida qué
 * hacer. `code` va como `enum` (y no como `anyOf` de literales) para que el
 * OpenAPI y los tipos de native lo lean como una unión de strings.
 */
export const ApiErrorSchema = Type.Object(
  {
    error: Type.String(),
    code: Type.Unsafe<ErrorCode>({ type: 'string', enum: [...ERROR_CODES] }),
  },
  { $id: 'ApiError' },
);
export type ApiError = Static<typeof ApiErrorSchema>;

/** Las respuestas de error de una ruta, todas con `ApiError`. */
export function errorResponses<S extends number>(...statuses: S[]) {
  const ref = Type.Ref(ApiErrorSchema);
  return Object.fromEntries(statuses.map((s) => [s, ref])) as Record<S, typeof ref>;
}

/** `{ ok: true }`: lo responden las escrituras que no devuelven datos. */
export const OkSchema = Type.Object({ ok: Type.Literal(true) }, { $id: 'Ok' });

/**
 * Registra los schemas con `$id` que todavía no estén visibles desde `app`.
 * Idempotente: lo llama cada `register<Módulo>` sobre la app raíz (para que el
 * OpenAPI los tenga como componentes) y cada plugin de rutas sobre su propio
 * contexto (para que sus tests puedan registrarlo solo).
 */
export function addSharedSchemas(app: FastifyInstance, schemas: readonly TSchema[]): void {
  for (const schema of schemas) {
    const id = schema.$id;
    if (!id) throw new Error('addSharedSchemas: el schema necesita $id');
    if (!app.getSchema(id)) app.addSchema(schema);
  }
}
