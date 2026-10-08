# Documentación

Fuentes de verdad, en este orden: el código que corre, el schema de Supabase y estos documentos. El repo `fitogenix-agents` (CONTEXT, BITÁCORA, ADRs de tres dígitos, tareas FTG-*) **no** es fuente de verdad.

| Si querés… | Leé |
|---|---|
| Saber qué tiene que hacer el sistema y qué falta | [requerimientos.md](requerimientos.md) |
| Entender cómo está armado (server, base, contrato, ETL) | [arquitectura.md](arquitectura.md) y [adr/](adr/README.md) |
| Ver la API | [`contract/openapi.json`](../contract/openapi.json) |
| Saber qué se decidió | [decisiones.md](decisiones.md) |
| Entender el puntaje y su fundamento | [dominio-scoring.md](dominio-scoring.md) |
| Entender qué problemas tiene la base de productos | [analisis_BD_Productos.md](analisis_BD_Productos.md) |
| Ver el plan del catálogo verificado | [06-catalogo-confiable.md](06-catalogo-confiable.md) |
| Ver lo que se dejó para más adelante | [deuda-tecnica.md](deuda-tecnica.md) |
| Deployar o volver atrás | [deploy.md](deploy.md) |
| Probar la app a mano | [pruebas-manuales.md](pruebas-manuales.md) y [checklist-accesibilidad.md](checklist-accesibilidad.md) |

La arquitectura de la app está en su repo: `fitogenix-native/docs/arquitectura.md`.

## Definition of Done

Un PR está terminado cuando:

1. **Tests:** pasan, incluidos los de las zonas de alto riesgo (scoring y auth). Si un cambio rompe a propósito un test de caracterización, el test se actualiza en el mismo PR, con el motivo. Nunca se borra para que pase.
2. **CI verde:** typecheck, tests, `lint:deps`, `lint:unused`, `contract:check`, imagen Docker y migraciones. En native: `tsc`, lint, knip, `contract:check` y tests.
3. **Tamaño:** menos de ~400 líneas de diff sin contar renombres, y se puede revertir con `git revert`.
4. **Contrato:** si cambia un endpoint, se regenera `contract/` y se actualiza `contract/CHANGELOG.md`. Native regenera sus tipos en un PR enlazado.
5. **Base:** toda migración vive en `supabase/migrations/`, con su rollback escrito, RLS activo y sin grants para `anon` (ADR-0009).
6. **Docs en el mismo PR:**
   - Si cambia un requisito → [requerimientos.md](requerimientos.md).
   - Si cambia un módulo, una tabla o una regla de arquitectura → [arquitectura.md](arquitectura.md).
   - Si se decide algo nuevo → una fila en [decisiones.md](decisiones.md), y un ADR si es de arquitectura.
   - Si algo se difiere → [deuda-tecnica.md](deuda-tecnica.md).
7. **Seguridad:** sin secretos en el código, en los logs ni en `docs/`. Toda variable nueva va documentada en `.env.example`.
8. **Revisión:** los PRs que tocan scoring, auth, el contrato o la base tienen una revisión explícita de esas partes.

## Otros archivos

- `sql/b03-rollback.sql`: ejemplo de SQL de vuelta para una migración.
