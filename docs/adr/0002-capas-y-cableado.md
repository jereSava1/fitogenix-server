# ADR-0002 · Capas por módulo, puertos y cableado sin contenedor de DI

- **Estado:** Aceptado · implementado
- **Fecha:** 2026-09-28
- **Relacionado:** ADR-0001, [arquitectura.md](../arquitectura.md)

## Contexto

- Los servicios actuales crean sus propios clientes de infraestructura al importarse (`createClient` en `cacheService.ts`, `savedProductsService.ts`, `scanHistoryService.ts`, `plugins/auth.ts` y **uno por request** en `routes/users/deleteMe.ts`).
- Para testearlos hoy hay que mockear módulos enteros (`vi.mock` de Supabase y Redis) en vez de pasar dobles de prueba.
- La lógica de negocio (qué nivel de cache consultar, cuándo un producto no existe) está mezclada con detalles de Supabase (`maybeSingle`, código de error `23503`).

## Decisión

Cada módulo usa hasta cuatro capas, con una regla de dependencia que apunta hacia adentro:

`routes` → `application` → `domain`, e `infrastructure` → `application` (implementa sus puertos) y `domain`.

1. **`application`** define **puertos** (interfaces TypeScript) para lo que necesita del exterior (`ProductReader`, `ProductCache`, `SavedRepository`…) y **casos de uso** como funciones fábrica que los reciben (`makeLookupProduct({ reader, cache })`).
2. **`infrastructure`** implementa los puertos con Supabase, Redis o APIs externas, y traduce los errores técnicos a errores de la aplicación (ADR-0006).
3. **`routes`** solo hace HTTP: schema, parseo y mapeo de resultados a status codes.
4. **Cableado manual** en `modules/<x>/index.ts` y `main.ts`: sin contenedor de inyección de dependencias ni decoradores.
5. **Capas permitidas, no obligatorias:** si un módulo no tiene reglas de negocio (`feedback`), no tiene `domain/` ni `application/`. No se crean carpetas vacías.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Contenedor de DI (awilix, tsyringe, inversify) | Agrega magia (registro por nombre, decoradores) para ~15 dependencias que se cablean en pocas líneas |
| Clases de servicio con `constructor(deps)` | Equivalente a las fábricas; las funciones son más livianas y coinciden con el estilo actual del código |
| Mantener `vi.mock` de módulos | Funciona, pero acopla los tests a rutas de archivo y no fuerza a separar la lógica de la infraestructura |
| Capas obligatorias en todos los módulos | Sobre-ingeniería en `feedback` (ruta + insert) |

## Consecuencias

- **+** Los casos de uso se testean con fakes simples; los adaptadores, con tests de integración propios.
- **+** Cambiar Redis o Supabase toca un solo archivo por puerto (portabilidad, ADR-0007).
- **−** Un poco más de código de cableado en cada `index.ts`.
- **Justificación:** DIP (los casos de uso dependen de abstracciones), ISP (puertos chicos, lectura separada de escritura), KISS (sin framework de DI).
