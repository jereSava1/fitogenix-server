# Documentación de fitogenix-server

Auditoría, requisitos, arquitectura objetivo y plan de limpieza de Fitogenix (server + app native), elaborados el 2026-09-28 sobre `main`.

**Fuentes de verdad**, en este orden: el código que efectivamente corre, el schema real de Supabase y las decisiones registradas acá. Los documentos del repo `fitogenix-agents` (CONTEXT, BITÁCORA, ADRs `ADR-00x`, tareas FTG-*) **no** son fuente de verdad.

## Por dónde empezar

| Si querés… | Leé |
|---|---|
| Saber qué se decidió y por qué | [`decisiones.md`](decisiones.md) (índice único, D-01 a D-85) |
| Probar la app a mano y ver lo que se encontró | [`pruebas-manuales.md`](pruebas-manuales.md) |
| Entender cómo está el sistema hoy | [`00-inventario.md`](00-inventario.md) |
| Saber qué tiene que hacer el sistema | [`01-requerimientos.md`](01-requerimientos.md) |
| Ver cómo se va a organizar el server | [`02-arquitectura.md`](02-arquitectura.md) y [`adr/`](adr/README.md) |
| Ver la API y los datos (endpoints, campos, tablas) | [`03-contratos.md`](03-contratos.md) |
| Ver qué falta, qué sobra y qué está roto | [`04-analisis.md`](04-analisis.md) |
| Ver el plan de trabajo | [`05-plan.md`](05-plan.md) (backlog por etapas + Definition of Done) |
| Entender el criterio del puntaje y su fundamento | [`dominio-scoring.md`](dominio-scoring.md) |
| Ver lo que se dejó para más adelante | [`deuda-tecnica.md`](deuda-tecnica.md) |

## Contenido

| Ruta | Qué es |
|---|---|
| `00-inventario.md` … `05-plan.md` | Un documento por fase de la auditoría |
| `decisiones.md` | Registro único de decisiones |
| `dominio-scoring.md` | Qué evalúa el motor, cómo se arma el puntaje, bandas y sello, los octógonos y la norma que los fundamenta, y los temas abiertos del motor |
| `checklist-accesibilidad.md` | Checklist manual de F-13 (VoiceOver, TalkBack, letra grande y reducir movimiento) |
| `deuda-tecnica.md` | Temas diferidos (catálogo limpio, cobertura del 95%, contenido neto, hosting de imágenes, analítica, calidad del motor) |
| `adr/` | Decisiones de arquitectura (ADR-0001 a ADR-0011) con contexto, alternativas y consecuencias |
| `borradores/dependency-cruiser.cjs` | Borrador original de las reglas de dependencias (ya copiado a la raíz como `.dependency-cruiser.cjs` en M-01) |
| `sql/fase3-schema-real.sql` | Consultas de solo lectura usadas para relevar Supabase |
| `sql/c05/` | C-05: procedimiento para generar la baseline de migraciones con la CLI de Supabase |
| `sql/u01/` | U-01: verificación, cambio y rollback para cerrar el catálogo a la anon key, con el procedimiento y las pruebas |
| `raw/` | Salidas crudas de herramientas (knip, madge, tsc, vitest, dependency-cruiser), schema real de Supabase, migración 015 aplicada en producción y el patch del arreglo de paginación del ETL |

## Regla de mantenimiento

Todo cambio de código que altere algo descrito acá (un endpoint, un campo, una tabla, una decisión) actualiza el documento correspondiente **en el mismo PR**. La regla completa ("Definition of Done") está en `05-plan.md`.
