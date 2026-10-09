# Recorrido completo del catálogo — 8 de octubre de 2026

Se leyó la tabla products completa mediante solicitudes GET: **81.444 filas en 82 páginas**. El conteo final coincide con el inicial. La lectura ocurrió aproximadamente entre las 22:29 y 22:30 de Argentina. Es una captura paginada, no una transacción atómica: pueden existir cambios concurrentes entre páginas.

Todas las filas capturadas pasaron por la revisión local de códigos, el detector B de texto y el diagnóstico C de nutrición. Se comprobaron hashes de páginas e identidades únicas. Los originales se conservaron en archivos privados de trabajo; esta entrega no contiene la copia completa de la base.

## Códigos de barras

| Resultado de la comprobación local | Filas |
|---|---:|
| Longitud GTIN estándar y dígito de control coincidente | 79.702 |
| Longitud distinta a la de un GTIN estándar | 1.675 |
| Dígito de control no coincidente | 67 |
| Códigos exactamente repetidos | 0 |

Comprobar formato y dígito no demuestra que el código corresponda al producto. Una longitud diferente puede ser un código interno u otra representación que requiere revisión; no se descarta el registro ni se corrige automáticamente. Tres pruebas de la comprobación GTIN pasaron.

## Texto y nutrición

- 62.145 registros quedaron sin dato de ingredientes según el detector.
- 2.083 requieren revisar el texto; las advertencias de alérgenos no se eliminan por estas alertas.
- 31 recibieron una propuesta de limpieza, todavía sin aplicar.
- 1.904 tienen los ocho campos nutricionales requeridos por el formato propuesto.
- 1.523 tienen al menos una alerta de nutrición. Las alertas por regla pueden solaparse.
- 1.222 cumplen tanto la completitud del formato como los controles numéricos ejecutados. Esto no equivale a verificar la etiqueta ni autoriza una actualización.

Estos conteos describen el catálogo completo, que también incluye artículos de higiene y posibles suplementos. Los faltantes no deben presentarse como errores de alimentos sin comprobar primero el alcance de cada registro.

## Qué falta

**En este recorrido no se consultó ningún código nuevo en Barcode Lookup.** El piloto externo anterior cubrió 11 códigos; no se extrapola a los 81.444 registros.

El siguiente paso es separar alimentos, artículos ajenos al alcance y productos de identidad dudosa. Después, contrastar los códigos alimentarios por lotes, dejando para cada uno su fuente, coincidencias, diferencias, faltantes y estado de consulta. Si una página no tiene el código, no se declara incorrecto. Una coincidencia numérica nueva sigue pendiente de revisión: no se atribuye automáticamente a Guille.

BORRADOR-CANDIDATOS-50.json es una selección inicial por datos faltantes. Incluye nombres desconocidos y artículos de higiene; exige comprobar su alcance antes de consultar o interpretar nutrición. No es un lote de alimentos validado.

## Límites y revisión

No se escribió en ninguna tabla de Supabase, no se modificó main ni se publicó nada en GitHub. Las decisiones locales figuran en REGISTRO-AUTOAPROBACIONES.md. La entrega queda para revisión; ninguna propuesta se aplicó a productos.
