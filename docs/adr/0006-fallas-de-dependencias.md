# ADR-0006 · Timeouts, errores de dependencias y health

- **Estado:** Propuesto. **Implementado** en H-01 y H-02 (punto 4, Auth: 503 cuando no hay claves para verificar el token o `DELETE /v1/users/me` no puede confirmar la sesión; el lookup sigue como anónimo). Además de los timeouts, las SELECT desactivan los reintentos de postgrest-js (`.retry(false)`): sin eso, una caída tardaba ~15 s en dar el 503
- **Fecha:** 2026-09-28
- **Relacionado:** RNF-D01, RNF-D02, RNF-D03, RNF-D05, RNF-U01, [01-requerimientos.md §2.3](../01-requerimientos.md)

## Contexto

Comportamiento actual verificado en código:

| Dependencia caída | Qué pasa hoy | Evidencia |
|---|---|---|
| Supabase DB | El lookup responde **404 "no está en el catálogo"** | `cacheService.ts · getCachedBy`, `findCachedProductByName`: `if (error …) return null` |
| Supabase Auth | Las rutas privadas responden **401 "sesión inválida"** y la app pide volver a iniciar sesión | `plugins/auth.ts`: cualquier error de `getUser` → 401 |
| Redis | El lookup cae a Supabase, pero **después de hasta 5 reintentos con backoff exponencial** (`50·eⁿ` ms) y sin timeout por request | `@upstash/redis` 1.38 default (`retry.retries = 5`); `redisService.ts` no configura nada |
| Cualquiera | `/health` responde 200 igual | `main.ts` |

No hay manejador de errores central: cada ruta arma su 500 a mano, y el lookup no tiene `try/catch` (un error inesperado sale con el formato por default de Fastify).

## Decisión

1. **Error tipado de dependencia:** la infraestructura traduce cualquier falla técnica (timeout, error de red, error de PostgREST que no sea "no encontrado") a `DependencyUnavailableError(dependency)`. **"No encontrado" nunca se representa con un error de la base**: es un resultado explícito del puerto (`null` solo cuando la consulta salió bien y no hubo filas).
2. **Manejador de errores central** en `platform/http/buildApp.ts`:
   - `DependencyUnavailableError` → **503** `{ error, code: "DEPENDENCY_UNAVAILABLE" }` + `Retry-After`
   - errores de validación → 400 con el formato de Fastify
   - cualquier otro → 500 genérico, logueado con `requestId`
   - la app ya distingue "no está" (404) de "error" (cualquier otro), así que 503 cae en "reintentar" sin cambios en el cliente
3. **Timeouts explícitos** (valores iniciales, se ajustan con el p95 medido):

   | Llamada | Timeout | Reintentos |
   |---|---|---|
   | Redis (lectura y escritura) | 200 ms | **0** en el camino de la request; fallar a Supabase |
   | Supabase (consulta del lookup) | 2 s | 0 |
   | Supabase Auth (si se sigue usando `getUser`, ADR-0008) | 2 s | 0 |
4. **Auth caído ≠ sesión inválida:** si la validación del token no se puede completar por una falla de dependencia, `requireAuth` responde **503**, no 401. `optionalAuth` degrada a anónimo (el lookup sigue funcionando, sin registrar el escaneo).
5. **Health en dos endpoints:** `/health` (liveness: el proceso responde, sin dependencias) y `/health/ready` (readiness: consulta liviana a Supabase con timeout de 1 s; Redis se informa pero no la vuelve "not ready", porque es opcional).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Circuit breaker (opossum) | Útil con muchas instancias y tráfico alto; con una instancia, timeouts cortos sin reintentos alcanzan (KISS). Se reevalúa si aparecen cascadas |
| Mantener los reintentos de Upstash | Convierten una caída de Redis en segundos de latencia por request, para una cache opcional |
| 500 para todo | El cliente no puede distinguir "reintentá en un rato" de "hay un bug" |

## Consecuencias

- **+** Cumple RNF-D01/D02/D03/D05 y restituye RNF-U01 (no se confunde caída con fuera de catálogo).
- **+** El 503 con `Retry-After` es la base para un monitoreo externo de disponibilidad (RNF-D07).
- **−** Cambia respuestas observables (404 → 503 y 401 → 503 ante caídas): va con tests de ruta que fijen cada caso.
- **Tests exigidos:** por puerto, un test con la dependencia fallando (error y timeout) que verifique el error tipado; por ruta, el status resultante (lookup: 200/404/503; privadas: 401 sin token, 401 token inválido, 503 Auth caído).
