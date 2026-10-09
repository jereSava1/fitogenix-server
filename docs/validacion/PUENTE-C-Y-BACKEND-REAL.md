# C: formato candidato comprobado con el backend real

2026-10-08. Continuación vigente de AUDITORIA-Y-AVANCE-C.md. Rama local separada. No se aplicaron datos ni se publicaron archivos.

## Qué funciona ahora

El normalizador C ya podía convertir porciones explícitas a 100 g o 100 ml. Se añadió un puente candidato para el formato de almacenamiento que consume el backend en productos con base de masa. El sodio y colesterol vuelven a gramos en `*_100g`, porque el extractor real los presenta en miligramos. Esto evita guardar 200 en un campo que espera 0,2 y multiplicar por 1000 nuevamente.

El puente valida primero el panel. No crea nutrientes ausentes ni modifica la captura. Conserva `applied=false`, `apply_authorized=false` y la evidencia. Aunque el formato sea compatible, el dato candidato no queda aprobado para aplicar.

Un panel por 100 ml se conserva normalizado en ml, pero no genera un candidato legacy con claves `_100g`. El contrato público no explicita la base como campo separado y esa interpretación debe acordarse con el equipo. No se infiere densidad ni se cambia el contrato para resolverlo.

## Antes y después, simulados en memoria

Las funciones reales `extractNutrition` y `toProductDetail` se ejecutaron sobre objetos locales. No se llamó a lookup, GET, Supabase, Redis o servicios HTTP.

| Producto | Sodio antes, mg/100 g | Sodio después simulado, mg/100 g | Estado |
|---|---|---|---|
| Tonadita | 200 | 200 | Coincide con 20 mg por 10 g; no necesita reemplazar el sodio de la captura |
| Doritos | 664 | 672 | Referencia de 168 mg por 25 g; pendiente, no aplicada |

Tonadita conserva 750 kcal, 83 g de grasas y 50 g de saturadas por 100 g. Los demás nutrientes ausentes continúan null. En Doritos todos los otros valores de presentación se conservan; la diferencia de 8 mg de sodio sigue en discusión. La simulación no confirma la fuente/fórmula de esa referencia.

## Compatibilidad y pruebas

90 pruebas de Node y 6 pruebas nuevas de integración local con funciones del backend pasaron (96 en total). Pasaron tipos, dependencias y código no utilizado. El backend real conserva la forma de NutritionFacts y se validó el panel contra el JSON Schema nutricional público con Ajv. No se afirma haber probado de nuevo todas las rutas HTTP o toda la suite del servidor.

La primera ubicación de la prueba importaba detalles del catálogo desde ETL y falló la regla de arquitectura. Se corrigió: los tests del puente solo usan código del ETL; la prueba del servidor vive dentro de catalog y lee un fixture JSON. No se debilitaron las reglas. El comprobador TypeBox Value no admitía los tipos nullable creados con Type.Unsafe en ese schema; la prueba ahora valida su JSON Schema con Ajv. No hubo cambios al schema de producción.

Se añadió solamente un archivo de pruebas en `src/`; no se cambió código productivo, rutas, scoring, dependencias o contrato. Pruebas con entorno ficticio y red externa bloqueada. Los originales de A y los 200 registros del fixture anterior permanecen intactos.

## Archivos y comandos para Jere

- `etl/validacion/puente-panel-backend-c.mjs`: genera formato candidato a partir de panel explícito.
- `etl/validacion/puente-panel-backend-c.test.mjs`: pruebas del cálculo/formato, sin imports internos del servidor.
- `docs/validacion/fixtures/paneles-backend-c.json`: simulación trazable de Tonadita y referencia Doritos.
- `src/modules/catalog/routes/panelFormat.integration.test.ts`: prueba local del extractor y presentación reales.

Con Node 22, desde la raíz del repo:

```bash
node --import tsx --test etl/validacion/detectar-texto-b.test.mjs etl/validacion/comparar-fuentes-b.test.mjs etl/validacion/preparar-revision-bc.test.mjs etl/validacion/auditar-catalogo-bc.test.mjs etl/validacion/normalizar-panel-c.test.mjs etl/validacion/puente-panel-backend-c.test.mjs
npx --no-install vitest run src/modules/catalog/routes/panelFormat.integration.test.ts
npm run typecheck
npm run lint:deps
npm run lint:unused
```

No usar estos resultados para actualizar filas automáticamente. Una futura aplicación necesita decidir procedencia/base, resolver los pendientes y respetar la prohibición vigente de escritura en tablas. Main y publicación continúan fuera de autorización.

B conserva su cierre técnico local. C tiene normalizador, diagnóstico y puente compatible con la presentación real para base g. Quedan apartados los candidatos faltantes, ficha conflictiva, referencia Doritos, base ml y decisión final de integración. D continúa como grupos de revisión locales, sin aplicación.
