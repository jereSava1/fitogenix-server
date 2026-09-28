# ADRs de fitogenix-server

Registro de decisiones de arquitectura de este repo. Formato: contexto, decisión, alternativas, consecuencias.

- Se numeran con **4 dígitos** (`ADR-0001`). Los `ADR-002`, `ADR-003`, `ADR-005` y `ADR-007` que aparecen en comentarios del código y en migraciones pertenecen a otro repo, **fuera de alcance**: no son estos y no valen como fuente.
- Estados: **Propuesto** → **Aceptado** / **Rechazado** → **Reemplazado por ADR-XXXX**.
- Un ADR aceptado no se edita: se reemplaza con uno nuevo.

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-monolito-modular.md) | Monolito modular con módulos por capacidad | Propuesto |
| [0002](0002-capas-y-cableado.md) | Capas por módulo, puertos y cableado sin contenedor de DI | Propuesto |
| [0003](0003-scoring-dominio-puro.md) | Scoring como dominio puro y única fuente de presentación del puntaje | Propuesto |
| [0004](0004-etl-fuera-del-runtime.md) | El ETL fuera del runtime, con config propia | Propuesto |
| [0005](0005-acceso-a-datos-y-propiedad-de-tablas.md) | Propiedad de tablas y acceso a Supabase por actor | Propuesto (revisado por 0010) |
| [0006](0006-fallas-de-dependencias.md) | Timeouts, errores de dependencias y health | Propuesto |
| [0007](0007-portabilidad-de-hosting.md) | Portabilidad de hosting | Propuesto |
| [0008](0008-validacion-de-jwt.md) | Validación del JWT: local con JWKS vs. `getUser` | **Aceptado** (D-29) |
| [0009](0009-migraciones.md) | Un solo mecanismo de migraciones + baseline | Propuesto |
| [0010](0010-server-unica-puerta-de-entrada.md) | El server como única puerta de entrada del cliente | Propuesto (D-28) |
| [0011](0011-contrato-http-fuente-unica.md) | El contrato HTTP como fuente única: TypeBox → OpenAPI → tipos del cliente | Propuesto |
