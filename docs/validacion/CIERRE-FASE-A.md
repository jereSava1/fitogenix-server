# Cierre de la fase A — 2026-10-08

Estado: análisis documental cerrado para el alcance revisado; cierre preparado localmente y pendiente de revisión de Guille. No equivale a validar todo el catálogo ni a aplicar correcciones en producción.

Este documento actualiza el estado de la fase A. Las entregas anteriores son registros históricos: sus frases sobre ausencia de commits o publicación describen el momento en que fueron escritas. No se reescribe la evidencia original. La publicación remota de esta actualización no se ha realizado.

## Qué se terminó y para qué sirve

Se investigaron ocho casos de productos, con once EAN localizados en la captura de Supabase y Protein PM-24 sin identidad confirmada. Se reunieron las fuentes y las lecturas de etiquetas disponibles, se compararon nutrientes e ingredientes y se registraron por separado faltantes, conflictos, unidades y problemas de identidad.

Los nueve archivos de fase A contienen el informe, los pendientes, las propuestas sin aplicar, la evidencia, los controles y los scripts de lectura/auditoría. Permiten que Jere u otro agente continúe sin repetir la investigación ni tratar una cifra candidata como un dato confirmado. La captura corresponde al 08/10/2026 a las 15:09 UTC; no se hizo una captura nueva para este cierre.

## Antes y después del trabajo

| Antes | Después de la fase A |
|---|---|
| Diferencias y faltantes dispersos | Casos documentados con fuentes, unidades, conflictos y pendientes |
| Riesgo de copiar una tabla entre productos similares | Sabores, tamaños y mercados permanecen separados cuando no hay identidad confirmada |
| Ausencia o texto cualitativo podía interpretarse como cero | Se conserva la diferencia entre ausencia, cero, cantidad no significativa, ilegible y conflicto |
| No había un punto claro para retomar | Entrega, guía y registro de decisiones enlazados |

Las filas originales de Supabase siguen iguales. Los archivos de propuestas conservan `approved=false` y `applied=false`: no son órdenes de actualización.

## Pendientes conservados, sin bloquear la entrega documental

| Caso | Qué falta |
|---|---|
| Ilolay | Etiquetas e identidad de cada una de las cuatro presentaciones; no copiar recetas entre EAN |
| Bariloche | Respaldo completo de las tablas de 80/135 g y carbohidratos |
| Doritos | Resolver evidencia de sodio: captura 664 mg/100 g frente a referencia aportada de 168 mg/25 g = 672 mg/100 g; ingredientes pendientes |
| Rhodesia | Resolver diferencias entre fuentes y lectura parcial de un porcentaje diario |
| Monster | Verificar mercado y fórmula vigente; mantener separados 100 ml y 100 g |
| Protein PM-24 | Confirmar sabor y EAN; las cuatro tablas oficiales no identifican por sí solas al candidato |
| Sacaan | Datos incompletos y gráfico sin correspondencia confirmada; búsqueda cerrada por ahora |
| Tonadita | Sodio de referencia confirmado por Guille: 20 mg/10 g = 200 mg/100 g, coincide con la captura; no valida todo el producto |

También siguen pendientes las políticas de procedencia por campo, verificación, mínimos de datos y tratamiento de líquidos. No se autoaprueban cifras contradictorias ni cambios de criterio nutricional para cerrar el informe.

## Correcciones de código preparadas después del análisis

Estos cambios se distinguen del cierre de fase A:

- R-01, aprobada por Guille: convertir sodio y colesterol a miligramos antes de redondear. Ejemplos por 100 g: Bariloche 0 → 46 mg de sodio; Protein candidata 400 → 362 mg de sodio y 0 → 2,2 mg de colesterol; Doritos 700 → 664 mg de sodio; Tonadita permanece en 200 mg. Corrige presentación del dato existente, no su veracidad.
- R-02: corrección preventiva de mayúsculas con acentos y prototipo de etiqueta breve, por ejemplo `Almacén > Sal` → `Sal`. La etiqueta breve no está integrada al contrato HTTP; no se implementó esa integración en este cierre.
- Puntaje: sin cambios en este bloque. No se repararon categorías históricas en la base.

La entrega preparada anteriormente cuenta con 1.077 pruebas en 66 archivos. Es un resultado previo, no una nueva corrida ni una verificación de toda la base. El chequeo de contrato requirió normalización de CRLF/LF solo en lectura. Este cierre añade documentación y vuelve a ejecutar únicamente la auditoría local de fase A; su resultado se entrega separado.

Comprobación de este cierre: los nueve archivos originales coinciden con sus hashes del manifiesto, normalizando solo CRLF/LF en lectura. La auditoría local generó el informe y conservó los dos avisos numéricos conocidos y cinco imágenes con transcripción independiente pendiente o incompleta. No se ocultaron esos hallazgos ni se aprobaron sus valores. Los enlaces de los tres documentos del cierre existen. El diff de documentación pasó la comprobación de espacios; no se repitió la suite completa porque no cambió código.

## Permisos y siguiente paso

Guille pidió cerrar fase A y autorizó autoaprobaciones posteriores, con registro obligatorio y revisión humana antes de cualquier subida. El detalle operativo vive en [REGISTRO-AUTOAPROBACIONES.md](historial/REGISTRO-AUTOAPROBACIONES.md) y [GUIA-PARA-AGENTES.md](historial/GUIA-PARA-AGENTES.md).

No se tocó `main`, no se escribió en Supabase y no se hizo push, PR, merge ni despliegue en este cierre. Las decisiones locales posteriores pueden prepararse y comprobarse dentro del alcance del proyecto, pero no habilitan publicar, modificar tablas o dar por verificados datos sin evidencia.

Primero Guille revisa este cierre. La secuencia original para continuar es B, detector y limpieza de texto que no es ingrediente; C, estándar nutricional; D, lotes de 50 antes de escalar. Ver [CONTRASTE-Y-ORDEN-DE-FASES.md](historial/CONTRASTE-Y-ORDEN-DE-FASES.md). La integración de categoría breve es una corrección complementaria, no una condición para cerrar el análisis ni un cambio ya aplicado.

Referencias: [ENTREGA-FASE-A.md](historial/ENTREGA-FASE-A.md), [PENDIENTES-FASE-A.md](historial/PENDIENTES-FASE-A.md), [ENTREGA-PARA-JERE.md](historial/ENTREGA-PARA-JERE.md).
