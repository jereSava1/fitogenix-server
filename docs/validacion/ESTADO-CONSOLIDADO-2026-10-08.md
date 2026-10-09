# Estado consolidado para Guille, Jere y futuros agentes

Este es el punto de entrada vigente de la entrega del 8 de octubre de 2026. Los informes anteriores conservan el proceso, pero sus conteos y pendientes pueden haber quedado superados. Leer este documento antes de interpretar una entrega antigua.

**Corrección posterior de Guille:** no existe permiso del dueño para el barrido automatizado. La afirmación anterior fue un malentendido y queda rectificada. Scraping detenido; no corre un trabajador en segundo plano. La alternativa es evaluar la API comercial mediante una prueba acotada, no comprar ni consultar sin decidirlo. Leer `BARCODE-PERMISO-CORREGIDO-Y-API-2026-10-08.md`.

## Qué hicimos, en palabras simples

El objetivo es que Fitogenix muestre bien los datos que tiene, detecte los que necesitan revisión y pueda incorporar información confiable sin inventarla. Encontramos problemas distintos: errores del código que muestra números, datos incompletos, textos mezclados y productos cuya identidad no está confirmada. Una misma corrección no resuelve todos esos problemas.

Primero revisamos ocho casos de control, conservando etiquetas, originales y desacuerdos. Eso permitió distinguir qué podía arreglarse con código y qué necesitaba más evidencia. Los nueve archivos originales de A ya se subieron a una rama separada.

Después corregimos cómo el servidor convierte y redondea sodio/colesterol: primero convierte gramos a miligramos y después redondea. Por ejemplo, 0,046 g pasa a mostrarse como 46 mg. También preparamos un prototipo de categorías que propone una etiqueta breve como «Sal», conservando la clasificación original. Esas correcciones anteriores ya están en la rama remota de entrega; no se afirma que estén desplegadas o integradas a main.

La continuación pendiente de publicar añadió herramientas para revisar ingredientes, comparar fuentes y normalizar nutrición. Se probaron localmente y con funciones reales del backend en memoria. Luego se revisó una captura de todo el catálogo. Finalmente comenzamos a buscar códigos en Barcode Lookup; sus fichas aportan candidatos, no autorizan copiar automáticamente datos a Supabase.

## Qué ya está en GitHub

Se comprobaron referencias remotas con `git ls-remote`, sin modificar el remoto:

- `revision/fase-a-2026-10-08`: `ccc008881d12c7bf18962873292e61c336d0549b`.
- `revision/entrega-correcciones-2026-10-08`: `f41aa1acd10649d2e471a92800b7553d91c5f3c5`, igual al HEAD local de partida.
- `main`: `53cbc6e9cf72113f983cdc195dff3030564d68e7` en esa comprobación.
- `revision/fase-b-texto-ingredientes-2026-10-08` no apareció como rama remota.

No corresponde presentar R-01, el prototipo anterior de categorías o los nueve originales de A como novedades sin subir. La carpeta para GitHub reúne la modificación y archivos nuevos posteriores a `f41aa1a`, más este estado y los informes actuales. Los respaldos privados conservan datos y versiones de trabajo; no se deben copiar íntegros al repositorio.

## Qué código nuevo existe

**B: revisión de ingredientes.** El detector identifica rótulos, textos mezclados, paréntesis incompletos, posible OCR/INS dudoso y otras señales. Conserva el original y solo propone limpieza en casos claros. Mantiene «contiene derivados de leche», otras advertencias y cantidades legítimas de ingredientes. No se creó un campo público nuevo de advertencias.

El comparador relaciona observaciones por código/campo. Se corrigió un error de atribución: una coincidencia futura ya no queda automáticamente marcada como aprobada por Guille. Solo las 15 coincidencias numéricas de la muestra aceptada mantienen esa aprobación específica; no son 15 productos completos verificados.

**C: revisión nutricional.** El diagnóstico distingue cero de ausencia y señala unidades, bases o relaciones numéricas dudosas. El normalizador convierte porciones explícitas a 100 g o 100 ml. No transforma ml en g sin densidad, no deriva sodio desde sal y no completa datos de memoria.

El puente candidato adapta paneles con base en gramos al formato que consume el backend, evitando multiplicar sodio/colesterol por 1000 dos veces. Para base ml no genera un candidato legacy `_100g`. Se probaron funciones reales con objetos locales. El único archivo nuevo de esta continuación en `src/` es una prueba: no se conectaron las herramientas a rutas productivas, scoring o jobs de escritura.

| Caso | Resultado | Alcance |
|---|---|---|
| Tonadita, 20 mg de sodio por 10 g | 200 mg por 100 g; la captura ya coincide | No necesita sustituir ese sodio. |
| Doritos, captura 664 mg por 100 g | El backend presenta 664 correctamente | Corrección de presentación, no reemplazo del dato. |
| Doritos, referencia 168 mg por 25 g | 672 mg por 100 g | Simulación pendiente de confirmar fuente/fórmula; no aplicada. |
| Panel por 100 ml | Conserva ml; puente legacy bloqueado | Falta acordar representación de esa base. |

## Toda la base: diagnóstico completo

Se leyeron **81.444 filas** de products mediante GET, en **82 páginas**. El conteo final coincide con el inicial; se comprobaron hashes e identidades únicas. Es una captura paginada, no una transacción atómica: pueden existir cambios concurrentes.

Todas las filas capturadas pasaron por el chequeo de códigos y B/C. Esto cubre el catálogo de esa captura; no significa haber contrastado cada etiqueta o cada web.

| Hallazgo local | Filas |
|---|---:|
| Longitud GTIN estándar y dígito coincidente | 79.702 |
| Longitud distinta a la estándar | 1.675 |
| Dígito de control no coincidente | 67 |
| Códigos exactos repetidos | 0 |
| Sin dato de ingredientes según el detector | 62.145 |
| Texto que requiere revisión | 2.083 |
| Propuesta de limpieza preparada | 31 |
| Ocho campos nutricionales presentes | 1.904 |
| Con al menos una alerta nutricional | 1.523 |
| Completitud y controles numéricos cumplidos | 1.222 |

El formato del código no demuestra identidad; una longitud diferente puede ser un identificador interno. «Sin alertas» no significa «etiqueta validada». El catálogo incluye higiene, alcohol y otros artículos: comprobar alcance antes de interpretar faltantes nutricionales.

## Barcode Lookup: iniciado e incompleto

Guille corrigió su mensaje anterior: **no tienen permiso del dueño para el barrido completo**. La afirmación previa se conserva únicamente como historia rectificada. Las consultas automatizadas de páginas se detienen; una eventual prueba de API necesita acceso oficial y decisión de uso/costo.

Hay **25 códigos con respuesta**: 11 del piloto, cuatro de la continuación anterior y diez de una tanda realizada bajo el permiso que luego se aclaró inexistente. Son **9 fichas y 16 ausencias**. La última tanda encontró arroz Vanguardia con ingrediente «Arroz Blanco», sin nutrición visible. Nada se aplicó a tablas. La muestra no es aleatoria ni permite estimar el rendimiento de la API en todo el catálogo.

La prueba de acceso directo para automatizar el resto recibió **HTTP 403**, título «Barcode Lookup Security Verification», para `7790387113310`. El navegador había permitido la tanda. No se afirma que todos los accesos estén bloqueados; tampoco se considera ese código inexistente.

Quedan **81.419 pendientes**: uno con intento bloqueado y 81.418 sin intentar. Hay **1.629 tandas**, última de 19, conservadas como organización de revisión; no habilitan scraping ni son llamadas API ya ejecutadas. No corre un trabajador en segundo plano. La alternativa comercial es la API; se recomienda demostrar utilidad con una prueba antes de pagar el barrido completo. No se contrató API ni se evadieron verificaciones.

## Pruebas

La última comprobación de B/C pasó **90 pruebas de herramientas y 6 de integración local: 96**. Pasaron tipos, dependencias y código no utilizado. El comprobador GTIN pasó otras **tres pruebas**. Se conservaron los nueve originales de A y el fixture de 200 productos por hash.

Las 1.077 pruebas de la corrección anterior son históricas; no se atribuyen a una nueva suite completa de B/C. Las pruebas locales se hicieron con entorno ficticio y red externa bloqueada. No se verificó la app móvil porque falta acceso a su repositorio; eso no impide auditar datos o el backend.

## Fases reales

| Fase de este trabajo | Estado |
|---|---|
| A: controles/evidencia | Originales publicados; cierre complementario y pendientes documentados. |
| B: ingredientes/comparación | Herramientas probadas; diagnóstico global ejecutado; propuestas sin aplicar. |
| C: nutrición | Normalizador, diagnóstico y puente candidatos probados; criterios finales e integración pendientes. |
| D: tandas/escala | Organización preparada; búsqueda externa incompleta; ninguna aplicación. |

Estas fases no reemplazan las etapas generales del equipo. B cerrado técnicamente significa herramientas de diagnóstico listas, no base limpiada ni barrido externo terminado.

## Qué falta, en orden

1. Revisar esta entrega y publicar lo elegido en rama separada, después de la revisión de Guille. Publicar permite colaborar; no despliega ni aplica datos.
2. Evaluar una prueba oficial de API con alimentos seleccionados de forma reproducible: medir datos nuevos utilizables, no solo fichas encontradas. Confirmar costos, consumo de cuota por lote y condiciones de conservación de respuestas antes de contratar. Sin scraping, compra o consultas nuevas bajo este pedido de documentación.
3. Revisar los 14 valores candidatos iniciales, ficha conflictiva de Rhodesia, OCR/INS, identidad de Protein Bar y discrepancia de Doritos. No elegir cifras sin evidencia.
4. Acordar formato final de C: campos requeridos, líquidos por 100 ml, ausencias y criterios con evidencia. Ocho campos y tolerancias actuales son propuestas técnicas.
5. Revisar manualmente las limpiezas y alertas por lotes, conservando advertencias/originales y comprobando impacto en puntajes antes de conectar parsing.
6. Integrar al backend el alcance aprobado con pruebas de rutas/contrato. Para pantallas, el responsable con acceso revisará la app. La etiqueta breve sigue como prototipo.
7. Mantener aplicación a tablas fuera de este permiso: **Supabase es solo lectura**. Ninguna autoaprobación, coincidencia, publicación o merge revoca esa regla.

## Papel de Guille

No tiene que programar ni revisar 81.444 filas a mano. Revisa ejemplos concretos, elige alternativas y decide qué se publica. Jere u otro agente puede seguir la guía y los registros. La decisión externa ahora es si realizar una prueba oficial de API; no se requiere contactar al dueño para habilitar un supuesto permiso que no existe.

Todo lo autoaprobado figura en REGISTRO-AUTOAPROBACIONES.md. Las propuestas no están aplicadas en producción. Los archivos para GitHub y los respaldos privados están separados para facilitar revisión sin publicar una copia de la base.
