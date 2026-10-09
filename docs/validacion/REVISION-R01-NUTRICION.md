# R-01: revisar la conversión nutricional

Fecha: 2026-10-08. Estado: **aprobado por Guille; preparado localmente; no publicado**.

## Qué revisar en palabras simples

Antes, el servidor redondeaba una cantidad muy pequeña de sodio o colesterol antes de pasarla a miligramos. Podía mostrar cero cuando el dato decía otra cosa. Ahora convierte primero y redondea después.

| Ejemplo | Antes | Preparado ahora |
|---|---:|---:|
| Sodio de Bariloche en la captura | 0 mg | 46 mg |
| Sodio de la Protein candidata en la captura | 400 mg | 362 mg |
| Sodio de Doritos en la captura | 700 mg | 664 mg |
| Colesterol de la Protein candidata en la captura | 0 mg | 2,2 mg |
| Sodio de Tonadita por 100 g | 200 mg | 200 mg |

Esto corrige cómo el servidor presenta el dato existente. No verifica por sí solo la etiqueta, el sabor o la vigencia de un producto. Doritos mantiene pendiente el conflicto de fuentes entre 664 y 672 mg. Tonadita conserva tu referencia de 20 mg por 10 g.

Un cero declarado sigue siendo cero y un dato ausente sigue ausente. No se reemplazan frases de cantidad no significativa por ceros. En este primer cambio tampoco se modifica la tabla de la app, las categorías, los nombres o el puntaje.

**Decisión de Guille (2026-10-08):** aprobó la primera corrección: “la primera correcion me parece perfecta”. La aprobación corresponde al resultado de conversión y presentación de R-01. Publicar y desplegar siguen pendientes de autorización. La revisión siguiente propuesta es R-02, categorías con acentos.

En el mismo mensaje, Guille indicó que Doritos declara 168 mg de sodio por 25 g. La conversión aritmética es 168 × 100 / 25 = 672 mg por 100 g. Se registra como referencia aportada por el usuario, compatible con la evidencia de etiqueta anterior; no como una nueva verificación independiente de identidad, mercado o vigencia. La captura de la base conserva 664 mg y no fue modificada. R-01 presenta correctamente ese dato existente; sustituirlo por 672 sería una corrección de datos separada.

## Qué se cambió y cómo se comprobó

Rama local: `revision/correccion-01-nutricion`; base: `53cbc6e9cf72113f983cdc195dff3030564d68e7`. Se preparó sin commit ni push; después de la aprobación de Guille se conservó en el commit local `76bfd7f`. Sigue sin publicar ni desplegar. R-02 parte de ese commit en otra rama.

- `productData.ts`: conversión antes de redondear, una cifra decimal en la unidad de presentación; validación de entradas numéricas y resultados finitos.
- Nuevo `productData.test.ts`: 21 pruebas de conversión, cero, ausencia, lectura prioritaria, entradas inválidas y conservación del crudo.
- Referencias de `productResponse.test.ts`: solo dos cambios de sodio, 0→5 mg para Coca-Cola y 0→40 mg para Nutella. Esos fixtures contienen 0,005 y 0,04 g respectivamente. Puntajes y resto de respuestas iguales.

Las tres suites enfocadas pasaron: 56 pruebas. El chequeo completo pasó: 64 archivos y 1.057 pruebas. Cobertura: líneas 98,70 %, ramas 95,67 %, funciones 97,81 % y sentencias 98,06 %. `typecheck`, `lint:deps` y `lint:unused` pasaron.

Se mantuvo el contrato HTTP existente. El chequeo estándar de contrato no pasó en este checkout Windows por CRLF frente a LF; el mismo chequeo pasó normalizando únicamente las lecturas de sus dos JSON. No se regeneraron ni editaron archivos del contrato. Este resultado no se presenta como si el comando estándar hubiera pasado sin adaptación.

Los primeros intentos encontraron permisos del directorio temporal y falta de variables de configuración. Se resolvieron con una carpeta temporal dentro del área de trabajo y valores de relleno, sin credenciales reales. El chequeo completo de cobertura se repitió con esa configuración y finalizó correctamente. Durante los chequeos se bloqueó la red externa; los servicios de las pruebas fueron simulados.

No se ejecutaron migraciones, tareas de carga ni verificaciones contra Supabase real. No se ejecutó la parte de CI que requiere Docker o una base local, ni auditoría de dependencias en red; no cambiaron dependencias. `git diff --check` pasó. Dos referencias ajenas al alcance reescritas solo por saltos de línea durante la primera corrida se restituyeron; no se conservan cambios en ellas.

## Límites técnicos que siguen pendientes

El fallback actual de claves sin sufijo se conserva para no rediseñar la base de medida en R-01. Los problemas de 100 g frente a 100 ml, datos cualitativos, procedencia, identidad, merge y verificación permanecen para revisiones posteriores. No se usó esta corrección para marcar productos como verificados.

El cambio permite una decimal de miligramos en lugar de descartar cantidades pequeñas. No agrega campos al contrato. El código del motor no se modificó y sus pruebas de referencia pasaron; no se recalibró ningún puntaje.

Leer [el proceso y decisiones](historial/PROCESO-Y-DECISIONES-2026-10-08.md) y [la guía para agentes](historial/GUIA-PARA-AGENTES.md) antes de continuar.
