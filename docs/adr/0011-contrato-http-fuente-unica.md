# ADR-0011 · El contrato HTTP como fuente única: TypeBox → OpenAPI → tipos del cliente

- **Estado:** **Aceptado** (D-68, 2026-09-29): implementado en K-01 para el contrato actual (pasos 1 a 3: schemas TypeBox con `@sinclair/typebox` 0.34, `contract/openapi.json` generado y verificado en CI, tests de contrato). El formato único de errores y `/v1` llegaron con K-03 (contrato `0.2.0`), y los tipos generados de native (paso 4) llegaron con K-05 (2026-09-29, D-72: `npm run contract:sync` / `contract:check` en native, `openapi-typescript` 7.13 con un `overrides` para usar TS 6, `openapi-fetch` 0.17). Límite conocido: `tsc` no detecta un campo **de más** en un body enviado con `openapi-fetch`; lo cubren los tests de native, que comparan cada body
- **Fecha:** 2026-09-28
- **Relacionado:** [03-contratos.md §B.4.9 y §B.5](../03-contratos.md), ADR-0003, ADR-0010

## Contexto

- El contrato del producto existe **cuatro veces**: `src/types/fitogenix.ts` (TS), `routes/products/lookupSchema.ts` (JSON Schema transcripto a mano, atado al tipo con `satisfies`), el espejo manual de native (`src/lib/contracts/product.ts`, 133 líneas) y un reexport de native (`src/domain/product/lookupProduct.ts`).
- Solo 1 de los 8 endpoints actuales tiene schema de respuesta; los errores no tienen formato común.
- Con ADR-0010 la superficie crece a 24 endpoints, todos consumidos por native.
- Ya hubo roturas por desalineación entre server y cliente: el paso del motor v2 a v2.1 cambió la forma de la respuesta y el comentario de `lookupSchema.ts` lo registra.
- Fastify ya valida y serializa con JSON Schema (ajv y fast-json-stringify).

## Decisión

1. **Los schemas del server son la única fuente del contrato**, escritos con **TypeBox** (`@sinclair/typebox` + `@fastify/type-provider-typebox`) en `modules/*/routes/*.schema.ts`. De ahí salen el tipo TS del handler (`Static<>`), la validación del request, la serialización de la respuesta y el OpenAPI. No se escriben interfaces TS del contrato a mano.
2. **OpenAPI 3.1 generado** con `@fastify/swagger` por un script (`npm run contract:generate`) que escribe `contract/openapi.json`, **commiteado** en el server. No se expone Swagger UI en producción.
3. **CI del server:** regenera el OpenAPI y falla si hay diferencias; tests de contrato por ruta con `app.inject()` (respuestas y errores validan contra su schema).
4. **Native genera sus tipos** con `openapi-typescript` y usa `openapi-fetch` como cliente. El archivo generado se commitea en native. Se borran el espejo manual y el reexport.
5. **Formato de error único** (`{ error, code }`) y **changelog del contrato** (`contract/CHANGELOG.md`).
6. **Versión en la ruta:** todo el contrato cuelga de `/v1` (D-44). Una versión nueva (`/v2`) solo se abre ante un cambio que rompa y que no se pueda coordinar con un release de la app.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Zod + `fastify-type-provider-zod` + generador de OpenAPI | Funciona, pero Fastify es JSON Schema nativo: con Zod se agrega una capa de conversión y se pierde la serialización rápida directa. TypeBox *es* JSON Schema |
| OpenAPI escrito a mano (design-first) y código generado desde ahí | Dos fuentes para mantener sincronizadas (el YAML y los handlers) en un equipo chico |
| tRPC / ts-rest (tipos compartidos por import) | Ata el cliente a TypeScript y a importar código del server; OpenAPI es neutral (sirve para documentación, mocks y otros clientes) |
| Seguir con el espejo manual en native | Es la causa de las desalineaciones |

## Consecuencias

- **+** Un cambio de contrato se ve en un solo diff (`openapi.json`) y rompe la compilación de native si no se adapta.
- **+** Documentación de la API gratis y siempre actualizada.
- **−** Migrar los schemas actuales a TypeBox es parte del trabajo de cada módulo (Fase 5, un PR por módulo).
- **−** Native necesita un paso para traer el `openapi.json` del server (script que lo copia desde un checkout vecino o desde un tag del repo); el archivo generado se commitea para que el CI de native no dependa del server.
