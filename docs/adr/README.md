# ADRs

Decisiones de arquitectura con su contexto, alternativas y consecuencias. Un ADR aceptado no se edita: se reemplaza con uno nuevo. Las decisiones chicas van en [decisiones.md](../decisiones.md).

Los `ADR-002`, `ADR-003`, `ADR-005` o `ADR-007` (tres dígitos) que aparecen en algún comentario viejo son de otro repo y no valen como fuente.

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-monolito-modular.md) | Monolito modular con módulos por capacidad | Aceptado |
| [0002](0002-capas-y-cableado.md) | Capas por módulo, puertos y cableado sin contenedor de DI | Aceptado |
| [0003](0003-scoring-dominio-puro.md) | El motor de puntaje es dominio puro y la única fuente de su presentación | Aceptado |
| [0004](0004-etl-fuera-del-runtime.md) | El ETL fuera del runtime, con config propia | Aceptado |
| [0005](0005-acceso-a-datos-y-propiedad-de-tablas.md) | Cada tabla tiene un dueño; el acceso a Supabase es por actor | Aceptado (revisado por 0010) |
| [0006](0006-fallas-de-dependencias.md) | Timeouts, errores de dependencias y health | Aceptado |
| [0007](0007-portabilidad-de-hosting.md) | Portabilidad de hosting | Aceptado |
| [0008](0008-validacion-de-jwt.md) | El JWT se valida localmente con JWKS | Aceptado |
| [0009](0009-migraciones.md) | Un solo mecanismo de migraciones, con baseline | Aceptado |
| [0010](0010-server-unica-puerta-de-entrada.md) | El server es la única puerta de entrada de la app | Aceptado |
| [0011](0011-contrato-http-fuente-unica.md) | El contrato HTTP sale de TypeBox → OpenAPI → tipos de la app | Aceptado |
