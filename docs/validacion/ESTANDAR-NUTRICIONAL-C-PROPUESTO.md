# Fase C — estándar y auditoría local de formato

Estado: prototipo técnico, no integrado al servidor ni aplicado a tablas. Continúa el plan operativo original. La revisión B y los datos pendientes no se convierten en una validación completa del catálogo.

## Correspondencia con el backend actual

Se leyó `src/modules/catalog/domain/productData.ts`: `extractNutrition` produce `NutritionFacts` con calories, protein, carbs, sugars, fats, satFats, sodium, fiber, transFat y cholesterol. El prototipo reutiliza esos nombres para que una futura integración no agregue campos HTTP o exija cambios de la app por sí misma. No importa `etl/` desde `src/` ni modifica el contrato TypeBox/OpenAPI.

| Campo | Clave cruda por 100 g | Unidad de salida | Conversión |
|---|---|---|---|
| calories | energy-kcal_100g | kcal | Ninguna |
| protein | proteins_100g | g | Ninguna |
| carbs | carbohydrates_100g | g | Ninguna |
| sugars | sugars_100g | g | Ninguna |
| fats | fat_100g | g | Ninguna |
| satFats | saturated-fat_100g | g | Ninguna |
| sodium | sodium_100g | mg | g × 1000, antes de presentar/redondear |
| fiber | fiber_100g | g | Ninguna |
| transFat | trans-fat_100g | g | Ninguna |
| cholesterol | cholesterol_100g | mg | g × 1000, antes de presentar/redondear |

Para medir completitud en este prototipo, los primeros ocho son requeridos y los dos últimos adicionales. Es un criterio de auditoría propuesto, no una nueva regla de rechazo de productos ni una modificación del contrato de la app. Los campos ausentes continúan null y cero explícito continúa cero. No rellenar fibra, grasas trans o colesterol por intuición.

El sufijo `_100g` describe la convención de almacenamiento observada. No prueba que una fuente anterior normalizara correctamente. En líquidos, no equiparar 100 g a 100 ml: el prototipo conserva la base de la clave y deja pendiente la base válida para el producto. No hay densidad inventada. Valores sin sufijo de base quedan pendientes; no se usa el fallback de `extractNutrition` para esta auditoría estricta.

## Límites y decisiones

- Valores negativos, infinitos, booleanos y cadenas con coma ambigua se señalan; no se reparan silenciosamente.
- Cadenas numéricas con punto decimal se pueden leer, conservando el original.
- No derivar sodio de sal, ni convertir kcal/kJ para completar una cifra ausente, ni copiar candidatos web.
- No redondear el dato normalizado a una décima: ese es un paso de presentación posterior. Se conserva el resultado de la conversión explícita.
- Completitud de formato no es verificación de etiqueta, plausibilidad nutricional o aprobación de cambios.
- La auditoría no activa el motor, jobs del ETL, historial de escaneos o nuevas advertencias.

## Ejecución reproducible

Desde la raíz del repositorio con Node 22, elegir una salida nueva:

```bash
mkdir -p work
node etl/validacion/preparar-revision-bc.mjs etl/validacion/propuestas-finales-a.json etl/validacion/barcode-web-muestra-b.json work/revision-bc-local.json
node --test etl/validacion/detectar-texto-b.test.mjs etl/validacion/comparar-fuentes-b.test.mjs etl/validacion/preparar-revision-bc.test.mjs
```

La herramienta registra el criterio humano expresado en esta conversación, no una política general automáticamente aplicable a otro proyecto o a todo el catálogo. Una futura exportación necesita adaptarse al esquema de entrada y preservar procedencia e identidad; no basta cambiar el nombre del archivo.

## Lotes preparados, sin iniciar aplicación D

`makeBatches` distribuye registros locales en grupos de hasta 50 y mantiene juntas las identidades con varios códigos. Se probó con 101 registros: 50, 50 y 1, sin pérdida ni duplicación. Para la captura actual hay un grupo de 12 entradas, no 50 productos verificados. Es planificación de revisión, no autorización para escribir, publicar o escalar al catálogo completo.

Antes de integrar: Jere debe revisar este módulo y acordar el criterio de completitud/base de líquidos. La futura integración debe mantener valores ausentes explícitos, contrato y separación ETL/servidor. Necesitaría pruebas de rutas/contrato si modifica `src/`; esas pruebas no se atribuyen a este prototipo aislado. Main y Supabase siguen fuera del alcance de escritura.

## Diagnóstico ampliado C

`diagnosticar-nutricion-c.mjs` añade alertas de rangos según el ETL existente, metadata dudosa y relaciones. Son avisos de revisión sin reparación; los límites adicionales para transFat/colesterol corresponden a cantidad máxima de componente por 100 g, no evaluación médica. La auditoría de 200 y el estado de pruebas se detallan en CIERRE-B-Y-AVANCE-C.md. No sustituye la decisión del equipo sobre campos/base ni la procedencia de cada cifra.

## Conversión explícita de paneles

Implementada normalizar-panel-c.mjs con paneles-c-muestra.json y pruebas. Exige evidence_id, cantidad de base positiva en g/ml y nutrientes con unidades explícitas. Mantiene g/ml separados y conserva procedencia. No convierte kJ a kcal ni rellena ceros. Ver AUDITORIA-Y-AVANCE-C.md: conversión comprobada no significa etiqueta verificada; referencia Doritos sigue pendiente. La herramienta permanece fuera del servidor.

## Compatibilidad local comprobada

puente-panel-backend-c.mjs adapta paneles g al formato existente, sin publicar. Prueba real en catalog valida extractNutrition/toProductDetail y JSON Schema nutricional. Base ml bloqueada para la adaptación legacy: no inferir densidad ni cambiar contrato. Ver PUENTE-C-Y-BACKEND-REAL.md; el único archivo nuevo en src es test de integración local.
