# Fase B — detector local y limpieza propuesta

No se conecta a Supabase, servicios externos, scoring ni jobs del ETL. No modifica el JSON de entrada. Genera un archivo de revisión nuevo, con `applied=false`, texto original, fragmentos detectados, posiciones y declaraciones preservadas. No ejecuta correcciones en la app o la base.

## Ejecutar desde la raíz del repositorio, con Node 22

```bash
node etl/validacion/detectar-texto-b.mjs etl/validacion/propuestas-finales-a.json work/propuestas-texto-b-nuevas.json
node --test etl/validacion/detectar-texto-b.test.mjs
```

Crear `work/` si no existe. La salida tiene que ser nueva: no se sobrescribe. No ejecutar `etl:merge`, `etl:fix-quality`, `etl:all` ni otros jobs para probar este detector. No hacen falta variables de entorno o claves. Verificar antes que la rama no sea `main`.

La entrada puede ser el documento de fase A sin aplicar o un array JSON con objetos `{ "id": "ejemplo", "ingredients_text": "Agua, sal" }`. El campo de texto debe ser string o null. El límite de entrada es 20 MB: dividir las capturas en archivos locales si hace falta. No se exportó de nuevo el catálogo ni se inició el procesamiento de lotes de fase D.

Las pruebas usan `node:test`, explícitamente: no están incluidas en `npm test`/Vitest. Verifican conservación de input, límites de extracción, casos donde NO hay que limpiar, identidad y rechazo de sobrescritura. Los offsets son índices de string de JavaScript (UTF-16), no posiciones de bytes.

## Qué detecta

Rótulos de ingredientes, declaraciones de alérgenos, instrucciones de conservación, textos de fabricante/registro, una frase explícita sobre colesterol, declaraciones de harina enriquecida, unidades, abreviaturas con punto, algunos errores de OCR observados en A, saltos de línea, paréntesis incompletos y repetición explícita del mismo INS. Es un conjunto conservador de reglas, no una clasificación completa de ingredientes ni un validador de códigos INS.

Versión b-3: solo propone separar un rótulo claro o la frase exacta de colesterol documentada. NO propone retirar declaraciones de alérgenos: siguen en el texto, además de conservarse en el informe. Las cantidades explícitas como `sucralosa (5mg/100g)` se conservan como información, sin clasificar automáticamente la unidad como basura. Si hay cualquier señal ambigua, no genera una limpieza parcial: `proposed_text=null`. No elimina vitaminas ni inventa ingredientes/códigos; no junta líneas o deduplica aditivos. No reordena ni normaliza la receta. Declaraciones desconocidas se conservan como `declaracion_por_clasificar`.

`sin_hallazgos_del_detector` significa que estas reglas no hallaron problemas, NO que la receta está verificada. `conservado_sin_limpieza` indica que se registraron declaraciones claras o cantidades, sin retirarlas ni verificar sus valores. `propuesta_pendiente_revision` tampoco valida la etiqueta. Todos los resultados conservan `verified=false`. Si solo hay declaraciones sin ingredientes, no se propone una lista vacía.

Los originales de A provienen de una captura fechada: no son datos consultados hoy otra vez. No copiar una receta entre EAN ni usar el nombre para reconstruirla. No conectar propuestas al motor: retirar texto puede alterar puntajes. Mantener D-92 y revisión humana antes de publicación.

## Revisión y continuidad

Leer primero `docs/validacion/FASE-B-MEJORAS-Y-PILOTO-WEB.md` (b-2), luego el resultado histórico `FASE-B-RESULTADO.md`, `CONTRASTE-Y-ORDEN-DE-FASES.md` y `REGISTRO-AUTOAPROBACIONES.md`. Este bloque prepara y prueba B con los casos disponibles; no declara limpio todo el catálogo. Ampliar con ejemplos concretos los falsos positivos/negativos antes de considerar ejecución general. El contrato nutricional de C y los lotes de D se mantienen separados. `barcode-web-piloto-b.json` documenta dos lecturas públicas sin API; no es una herramienta de scraping ni un catálogo validado.

## Ampliación vigente b-3

Leer primero `docs/validacion/FASE-B-AMPLIACION-Y-REVISION.md`. El piloto nuevo `barcode-web-muestra-b.json` cubre los 11 códigos conocidos; el archivo de dos códigos queda como historia. El comparador es offline: no descarga páginas ni consulta tablas. Recibe la captura A y la evidencia web; conserva valores sin normalizarlos cuando la base es desconocida. `coincidencia_numerica` no significa dato validado. Toda salida es nueva y `applied=false`.

```bash
mkdir -p work
node --test etl/validacion/detectar-texto-b.test.mjs etl/validacion/comparar-fuentes-b.test.mjs
node etl/validacion/detectar-texto-b.mjs etl/validacion/propuestas-finales-a.json work/propuestas-b-revision.json
node etl/validacion/comparar-fuentes-b.mjs etl/validacion/propuestas-finales-a.json etl/validacion/barcode-web-muestra-b.json work/comparacion-b-revision.json
```

Los ejemplos usan nombres de salida nuevos. Si ya existen, elegir otros: no borrarlos para repetir. Ningún comando escribe en Supabase. Mantener barcode como string, sin perder ceros iniciales. El detector rechaza ID vacío/repetido y esquema malformado. El comparador exige códigos conocidos, URL exacta por código y unidades explícitas; rechaza unidades incompatibles, valores negativos/no finitos y campos repetidos. No deriva sodio de sal.

## Continuación B/C

Estado vigente: docs/validacion/CONTINUACION-BC-RESULTADO.md. Ejecutar `node etl/validacion/preparar-revision-bc.mjs etl/validacion/propuestas-finales-a.json etl/validacion/barcode-web-muestra-b.json work/revision-bc-nueva.json`. Añadir `etl/validacion/preparar-revision-bc.test.mjs` al comando node --test. Salida nueva, sin variables de entorno, API o conexión a Supabase. El criterio humano corresponde a este piloto; no usarlo como política universal de validación.

## Cierre técnico B y auditoría ampliada C

Estado vigente: docs/validacion/CIERRE-B-Y-AVANCE-C.md. Nuevo comando: `node etl/validacion/auditar-catalogo-bc.mjs src/modules/scoring/domain/fixtures/catalog-sample.json work/auditoria-200-nueva.json`. Añadir `etl/validacion/auditar-catalogo-bc.test.mjs` a node --test. Leer ALERTAS-C-MUESTRA-200.md y REVISION-B-MUESTRA-200.md para pendientes. El auditor recibe un array local; no una respuesta API envuelta ni un archivo de fase A. Siempre elegir salida nueva. La muestra no incluye EAN: los IDs locales son posiciones de archivo, nunca IDs de tabla. Los rangos/relaciones solo señalan, no corrigen. No requiere entorno ni red.

## Versión auditada y continuación C

Estado vigente: docs/validacion/AUDITORIA-Y-AVANCE-C.md. Las aprobaciones numéricas se limitan a los 15 valores documentados; coincidencias futuras quedan pendientes. Nuevo normalizador: `node etl/validacion/normalizar-panel-c.mjs etl/validacion/paneles-c-muestra.json work/paneles-c-nuevos.json`. Añadir normalizar-panel-c.test.mjs al comando de pruebas (cinco archivos). No extrae OCR ni acepta base ausente, no integra a servicios y no requiere claves. La auditoría de exportaciones señala barcode repetido sin deduplicar.

## Puente C y backend real

Estado vigente: docs/validacion/PUENTE-C-Y-BACKEND-REAL.md. Añadir puente-panel-backend-c.test.mjs al comando de Node; ejecutar por separado `npx --no-install vitest run src/modules/catalog/routes/panelFormat.integration.test.ts`. El fixture local está en docs/validacion/fixtures/paneles-backend-c.json. El puente llama normalizePanel y prepara solo formato por 100 g; una base ml conserva su panel pero bloquea legacy. Sodio/colesterol se almacenan en g y se presentan en mg. No conecta a base, rutas o scoring para aplicar datos.
