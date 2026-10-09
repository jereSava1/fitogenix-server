# Continuación B/C — resultado para revisión

2026-10-08. Rama local `revision/fase-b-texto-ingredientes-2026-10-08`. Sin commit, push, escritura en Supabase, cambios en main o integración al servidor. Este es el estado vigente; los informes anteriores conservan la historia.

## Tu decisión quedó registrada

15 valores se aceptan como validación por coincidencia numérica, por indicación de Guille. Se conserva qué número, campo, producto y fuente coinciden. La aceptación tiene alcance numérico: no afirma que la fórmula o base nutricional pendiente se haya confirmado. `verified=false` sigue describiendo la falta de verificación completa de etiqueta, no anula tu aceptación. No hay autorización de escritura.

| Producto | Campo | Valor coincidente | Unidad |
|---|---|---|---|
| ilolay-otro | energy-kcal_100g | 500 | kcal |
| ilolay-otro | fat_100g | 29 | g |
| ilolay-otro | saturated-fat_100g | 18 | g |
| ilolay-otro | carbohydrates_100g | 6 | g |
| ilolay-otro | proteins_100g | 41 | g |
| ilolay-otro | salt_100g | 1.1 | g |
| doritos | energy-kcal_100g | 504 | kcal |
| doritos | fat_100g | 32 | g |
| doritos | saturated-fat_100g | 3.6 | g |
| doritos | carbohydrates_100g | 48 | g |
| doritos | proteins_100g | 5.6 | g |
| doritos | salt_100g | 1.66 | g |
| doritos | energy-kj_100g | 2110 | kJ |
| doritos | sugars_100g | 2.4 | g |
| doritos | fiber_100g | 8.8 | g |

Los 14 candidatos faltantes y la ficha conflictiva quedan en `DECISIONES-PENDIENTES-BC.md`. No se pide resolverlos ahora ni se usan para completar datos. Las seis diferencias de Rhodesia y cuatro códigos ausentes también quedan registrados.

## Avance autónomo realizado

Se añadió `preparar-revision-bc.mjs`, con pruebas, para producir de forma reproducible: aceptación numérica, pendientes, auditoría nutricional y distribución local en lotes de hasta 50. Usa los campos actuales de NutritionFacts y convierte gramos a miligramos en sodio/colesterol sin redondear antes. Mantiene cero y ausencia distintos, no deriva sodio de sal, no copia candidatos web y no infiere base de líquidos.

Este es un prototipo de C, fuera de `src/`. D solo tiene preparación local de grupos, no aplicación. No se declaró completo el catálogo ni se procesaron registros que no estén en la captura disponible.

## Estado de formato por entrada

| Entrada | Campos requeridos ausentes o inválidos |
|---|---|
| ilolay-120 | calories, protein, carbs, sugars, fats, satFats, sodium, fiber |
| ilolay-otro | fiber |
| ilolay-40 | calories, protein, carbs, sugars, fats, satFats, sodium, fiber |
| ilolay-carrefour | calories, protein, carbs, sugars, fats, satFats, sodium, fiber |
| sacaan | calories, protein, carbs, sugars, fats, satFats, sodium, fiber |
| bariloche-135 | carbs |
| bariloche-80 | carbs |
| doritos | Ninguno; completo de formato, no verificado |
| rhodesia | carbs |
| monster | calories, protein, carbs, sugars, fats, satFats, sodium, fiber |
| tonadita | protein, carbs, sugars, fiber |
| protein | calories, protein, carbs, sugars, fats, satFats, sodium, fiber |

## Verificación y siguiente paso

61 pruebas locales pasaron (39 detector, 9 comparador, 13 continuación/estándar/lotes), más tipos, dependencias y código no usado. Red externa bloqueada y claves ficticias en pruebas. La evidencia original A se conserva por hash. No hay modificaciones a contratos HTTP, dependencias, scoring o src.

Por ahora no necesitás hacer nada. Al volver, leer este informe; los pendientes quedan para la conversación con el equipo. Antes de publicar, revisar y autorizar el paquete concreto. Jere puede reproducirlo siguiendo el estándar C y el README B. Una ejecución sobre todo el catálogo necesitará una captura nueva de solo lectura y controles adicionales; este prototipo no la sustituye.
