# Resultado conjunto para revisar

Fecha: 2026-10-08. R-01 aprobada; R-02 ampliada pendiente de tu revisión. Todo sigue local, sin publicar ni modificar Supabase o main.

Preferencia posterior: Guille descartó el detalle opcional. Las tablas de este documento conservan la muestra anterior como historia; el prototipo final muestra solo la etiqueta breve. El cierre y los pendientes vigentes están en [ENTREGA-PARA-JERE.md](ENTREGA-PARA-JERE.md).

## Categorías: acentos y presentación juntos

La etiqueta principal muestra el nivel más específico de una jerarquía explícita. El detalle conserva los niveles anteriores, con `/` en lugar de `>`. La clasificación original sigue disponible por separado y no se sustituye en los datos que usa el puntaje.

| Antes, con el código original | Etiqueta propuesta | Detalle opcional |
|---|---|---|
| LáCteos | Lácteos | Lácteos |
| AlmacéN > Sal | Sal | Almacén / Sal |
| AlmacéN > Mesa Dulce NavideñA | Mesa Dulce Navideña | Almacén / Mesa Dulce Navideña |
| Lácteos > Yogures > Yogures descremados | Yogures Descremados | Lácteos / Yogures / Yogures Descremados |
| SáNdwiches | Sándwiches | Sándwiches |

Son ejemplos ejecutados sobre textos de entrada como `Lácteos`, `Almacén > Sal` y `sándwiches`; la columna “antes” muestra lo que el código original producía con esos textos. No es una limpieza ya aplicada a la base ni una captura de pantalla de la app.

Si el texto de origen ya contiene `AlmacéN`, no se reconstruye automáticamente: puede mostrarse `Sal`, pero su detalle todavía conserva el error del texto original. Reparar categorías históricas tiene que revisarse aparte. No se pone todo en minúsculas para evitar cambiar siglas como `SIN TACC`.

La presentación se preparó como un prototipo local probado. Conectarlo a la app sigue pendiente de acceso a su código y de definir esa integración. El servidor mantiene su contrato actual y ningún proceso de carga se ejecutó.

## Nutrición: corrección anterior, ya aprobada

| Dato de la captura | Antes | Resultado preparado |
|---|---:|---:|
| Sodio de Bariloche | 0 mg | 46 mg |
| Sodio de Protein candidata | 400 mg | 362 mg |
| Colesterol de Protein candidata | 0 mg | 2,2 mg |
| Sodio de Doritos | 700 mg | 664 mg |
| Sodio de Tonadita por 100 g | 200 mg | 200 mg |

Doritos: tu referencia de 168 mg por 25 g equivale a 672 mg por 100 g. Se conserva como referencia de etiqueta, sin sustituir todavía los 664 mg de la captura. Mostrar bien el dato y corregir el dato son revisiones distintas.

Ceros y ausencias se conservan. No se modificó la fórmula del puntaje. La comprobación final pasó: 1.077 pruebas, más tipos y límites de dependencias. El contrato pasó con normalización de saltos de línea únicamente durante la lectura; no se editó.

## Qué decisión falta

Revisar si te gusta que la etiqueta diga **Sal** y el detalle diga **Almacén / Sal**, junto con los acentos corregidos. Se puede conservar ese formato o preparar otra alternativa antes de integrar la pantalla. Tu aprobación de R-01 sigue vigente; la nueva presentación no se declara aprobada todavía.

Más detalles en [REVISION-R02-CATEGORIAS.md](REVISION-R02-CATEGORIAS.md). Las decisiones y límites están en [PROCESO-Y-DECISIONES-2026-10-08.md](PROCESO-Y-DECISIONES-2026-10-08.md).
