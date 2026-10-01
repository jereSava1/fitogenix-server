// Piezas compartidas del contrato (TypeBox): validación, serialización y OpenAPI. Los
// schemas con `$id` se registran una vez y se referencian con `Type.Ref`.

import { Type, type Static, type TSchema } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';

/** `T | null` como `{ type: ['<tipo>', 'null'] }` (Type.Union daría un `anyOf`). */
export function Nullable<T extends TSchema>(schema: T) {
  // Por JSON para quedarse con el JSON Schema puro (sin los símbolos internos
  // de TypeBox, que son del tipo original).
  const { type, ...rest } = JSON.parse(JSON.stringify(schema)) as { type: string };
  return Type.Unsafe<T['static'] | null>({ ...rest, type: [type, 'null'] });
}

/** Enum de strings. Los valores van como claves de un `Record<T, true>`: tsc exige la
 *  unión completa, ni uno más ni uno menos. */
export function StringEnum<T extends string>(values: Record<T, true>) {
  return Type.Unsafe<T>({ type: 'string', enum: Object.keys(values) });
}

/** `true` si A y B son asignables en los dos sentidos: ata un tipo de application/ con
 *  su schema (`true satisfies SameShape<Static<typeof S>, T>`). */
export type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Reglas de los datos personales, iguales en el registro y en el perfil (03-contratos §B.3.3).
/** Letras de cualquier idioma, espacios, apóstrofe, punto y guion: ni `<`, ni `>`, ni números. */
export const PersonName = () =>
  Type.String({ minLength: 1, maxLength: 60, pattern: "^\\p{L}[\\p{L}\\p{M} '’.-]*$" });
export const Username = () => Type.String({ minLength: 3, maxLength: 30, pattern: '^[a-z0-9_.]+$' });
/** E.164. */
export const Phone = () => Type.String({ pattern: '^\\+[1-9][0-9]{6,14}$' });

/** Solo los códigos que el server responde hoy; uno nuevo se suma acá y en el CHANGELOG. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'PRODUCT_NOT_IN_CATALOG',
  'RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'EMAIL_TAKEN',
  'USERNAME_TAKEN',
  'INVALID_CODE',
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_CONFIRMED',
  'INVALID_REFRESH_TOKEN',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Error único del contrato: `error` para mostrar (español), `code` estable para decidir. */
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

/** Registra los schemas con `$id` que falten. Idempotente: lo llaman los `register*` sobre
 *  la raíz (OpenAPI) y cada plugin de rutas (para sus tests). */
export function addSharedSchemas(app: FastifyInstance, schemas: readonly TSchema[]): void {
  for (const schema of schemas) {
    const id = schema.$id;
    if (!id) throw new Error('addSharedSchemas: el schema necesita $id');
    if (!app.getSchema(id)) app.addSchema(schema);
  }
}
