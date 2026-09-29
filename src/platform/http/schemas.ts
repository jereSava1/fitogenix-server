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

import { Type, type TSchema } from '@sinclair/typebox';
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

/** Cuerpo de los errores que responden los handlers hoy: `{ error }`. El
 *  formato único `{ error, code }` llega con K-03. */
export const ApiErrorSchema = Type.Object(
  { error: Type.String() },
  { $id: 'ApiError' },
);

/**
 * El 500 de hoy tiene dos formas: `{ error }` cuando lo responde el handler, y
 * el genérico de Fastify (`{ statusCode, error, message }`) cuando algo lanza
 * antes o fuera del handler (T-04, T-06 y M-07 lo caracterizan). Se declaran
 * los dos para no recortar ninguno al serializar; K-03 los unifica.
 */
export const InternalErrorSchema = Type.Object(
  {
    error: Type.String(),
    statusCode: Type.Optional(Type.Number()),
    message: Type.Optional(Type.String()),
  },
  { $id: 'InternalError' },
);

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
