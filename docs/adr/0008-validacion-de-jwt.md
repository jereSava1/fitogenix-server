# ADR-0008 · Validación del JWT: local con JWKS vs. `getUser`

- **Estado:** Aceptado (D-29) · implementado
- **Fecha:** 2026-09-28
- **Relacionado:** RNF-D03, RNF-P01, RNF-S02, ADR-0006
- **Riesgo:** ALTO: todo cambio va con tests de caracterización.

## Contexto

- `plugins/auth.ts · requireAuth` valida cada request privada llamando a `supabase.auth.getUser(token)`: **un viaje de red a Supabase Auth por request**.
- El lookup con sesión valida el token **otra vez**, en segundo plano (`scanHistoryService.resolveUserIdFromToken`).
- Si Supabase Auth no responde, las rutas privadas contestan 401 y la app le pide al usuario que vuelva a iniciar sesión (RNF-D03).
- Supabase permite firmar los JWT con **claves asimétricas** y publica las claves públicas en un endpoint JWKS. El `.env` local de native tiene una variable `SUPABASE_JWKS_URL`: sugiere que el proyecto ya las usa (**a confirmar**).

## Opciones

| | A. Local con JWKS (recomendada) | B. `getUser` en cada request (hoy) |
|---|---|---|
| Cómo | Verificar firma, `exp`, `iss` y `aud` con las claves públicas (librería `jose`, JWKS cacheado en memoria) | Llamar a Supabase Auth por request |
| Latencia | ~0 ms (sin red, salvo refresco del JWKS) | Un viaje de red por request privada |
| Si Auth se cae | Sigue funcionando con tokens vigentes | 503 (con ADR-0006) o 401 (hoy) |
| Sesión revocada o usuario borrado | **El token sigue sirviendo hasta que vence** (por default 1 h, configurable en Supabase) | Rechazo inmediato |
| Requisito | Proyecto con claves asimétricas: en Supabase → Project Settings → JWT Keys, la clave **vigente** ("Current key") tiene que ser **ECC (P-256)** o **RSA**, no "Legacy HS256 (Shared Secret)" | Ninguno |

**Mitigación del punto débil de A:** para las operaciones sensibles (`DELETE /users/me`) se mantiene `getUser` además de la verificación local; y si se necesita revocar más rápido, se acorta la vida del token en Supabase.

## Decisión

**Opción A**, con `getUser` extra en `DELETE /users/me`. `requireAuth` y `optionalAuth` comparten la misma verificación (se elimina la segunda validación del lookup).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Secreto simétrico compartido (HS256) | Supabase lo está dejando de lado; el server tendría un secreto que le permitiría firmar tokens |
| Cachear el resultado de `getUser` por token | Reduce la latencia, pero sigue fallando si Auth se cae en frío, y agrega invalidación |

## Consecuencias

- **+** Cumple RNF-D03 y le saca la red al p95 de las rutas privadas.
- **−** Ventana de hasta la vida del token para sesiones revocadas (mitigada en eliminación de cuenta).
- **Tests exigidos** (antes de cambiar nada, caracterizan el comportamiento actual): sin header → 401; `Bearer` vacío → 401; token mal formado → 401; firma inválida → 401; token vencido → 401; token válido → `request.userId` correcto; ruta pública sin el hook. Con la opción A se agregan: `iss`/`aud` equivocados → 401; JWKS inaccesible en frío → 503.
