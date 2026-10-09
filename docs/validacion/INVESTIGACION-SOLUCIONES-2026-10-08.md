# Soluciones propuestas para Fitogenix

Fecha: 8 de octubre de 2026. Investigación terminada; implementación y publicación pendientes de tu confirmación.

## Para qué sirve este trabajo

El informe anterior identificó qué datos y comportamientos no son confiables. Esta investigación convierte esos problemas en cambios concretos: qué arreglar primero, cómo comprobarlo y qué decisiones te corresponden. No hace falta que sepas programar ni que vayas a buscar todas las respuestas con otra persona del equipo.

Hay dos clases de problemas: algunos números se muestran mal aunque la base los tenga bien; otros realmente están incompletos o en conflicto. Arreglar la pantalla no verifica los datos. Verificar los datos tampoco arregla por sí solo la pantalla.

Recomendación: empezar por corregir la presentación del servidor; después construir la validación en archivos separados; finalmente cambiar el puntaje cuando la evidencia sea suficiente y lo apruebes. Supabase puede seguir siendo solo lectura en este recorrido.

## Qué comprobé

Revisé el análisis de la base, los nueve archivos de la fase A, el código del servidor y el plan del equipo en otra rama. Consulté documentación oficial de Open Food Facts, GS1, Codex y autoridades argentinas. También ejecuté dos diagnósticos locales sobre funciones del servidor, sin iniciar el servidor ni el proceso que carga productos en Supabase.

Código examinado: `53cbc6e9cf72113f983cdc195dff3030564d68e7`. Documentación del equipo: rama `docs/pm-testing-manual`, commit `5ebc832a3d7c7db419bfd5867612a74ec41d6cf8`. La entrega de fase A está en `revision/fase-a-2026-10-08`, commit `ccc008881d12c7bf18962873292e61c336d0549b`.

Las cifras generales —81.444 registros, 59.893 vacíos y 2.383 con ingredientes y cuatro macros— proceden del análisis recibido. No volví a medir toda la base. Los casos de productos usan las capturas guardadas anteriormente; no prueban que la base siga idéntica hoy.

Los repositorios locales revisados siguen limpios. Esta investigación no hizo escrituras en GitHub, Supabase ni `main`; no ejecutó migraciones, RPC ni tareas de carga. Los documentos del repositorio son material de análisis: sus propuestas de crear tablas no autorizan hacerlo y ceden ante tu restricción de solo lectura.

## Hallazgos nuevos y correcciones posibles

| Problema comprobado | Qué ocurre ahora | Corrección propuesta |
|---|---|---|
| Redondeo del sodio antes de convertir gramos a miligramos | 0,046 g termina en 0 mg; 0,362 g en 400 mg; 0,664 g en 700 mg | Convertir primero y redondear al final. Deben salir 46, 362 y 664 mg, respectivamente. |
| Pérdida de colesterol pequeño | 0,0022 g termina en 0 mg | Conservar precisión para mostrar 2,2 mg. |
| Mayúsculas que rompen acentos | `Lácteos` se convierte en `LáCteos` | Usar una transformación compatible con Unicode o conservar el texto de origen. |
| Limpieza excesiva del nombre | El ejemplo de prueba `Raptor Protein (Peanut Butter) 45 g` pierde sabor y tamaño | Conservar el nombre original; separar el nombre de familia del sabor y la presentación. |
| Confusión entre metadatos y nutrientes | Un objeto que solo dice `nova-group: 4` pasa el control llamado “completo” | Medir nutrientes reales, ingredientes y verificación por separado. NOVA no es una tabla nutricional. |
| Prioridad de fuentes sin evaluar contenido nutricional | En una prueba, ese bloque vacío de nutrientes de OFF desplaza una tabla VTEX con calorías, proteínas y grasas | Elegir bloques que tengan nutrientes utilizables, evidencia e identidad compatibles; conservar el bloque descartado como evidencia. |
| Pérdida de la base de medida | El adaptador VTEX produce las mismas claves para datos por 100 g y por 100 ml | Conservar la base explícita. No convertir ml a g sin densidad documentada. |
| Validación insuficiente del código de barras | La función acepta cadenas de 9, 10 y 11 dígitos | Validar formato y dígito de control, conservando códigos originales y equivalencias comprobadas. |

Las dos primeras reproducciones utilizan magnitudes de nuestros casos de control. Los ejemplos de nombres, bloques OFF/VTEX, unidades y longitudes son entradas sintéticas: demuestran el mecanismo, no cuántos productos reales fueron afectados. Las pruebas adicionales de cadena vacía e infinito detectan falta de validación numérica; no encontramos esos valores en los productos capturados.

El redondeo está en `src/modules/catalog/domain/productData.ts`. El cálculo del puntaje usa los nutrientes crudos por otro recorrido: por eso podemos preparar una corrección de presentación sin recalibrar la fórmula. Habrá que probar que el puntaje y su desglose siguen iguales.

El merge actual conserva `nutriments` como un bloque de una fuente. No mezcla cada nutriente individualmente. Eso evita una tabla armada con fórmulas diferentes, pero su selección actual puede preferir un bloque sin nutrientes. La solución no es mezclar valores a ciegas.

La pérdida de filas en la app está documentada por el equipo, pero no comprobada directamente en su código: no tenemos acceso al repositorio de `fitogenix-native`. El servidor sí pudo revisarse. [Código de presentación](https://github.com/jereSava1/fitogenix-server/blob/etl-validacion/src/modules/catalog/domain/productData.ts), [merge](https://github.com/jereSava1/fitogenix-server/blob/etl-validacion/etl/lib/merge.ts), [pruebas manuales](https://github.com/jereSava1/fitogenix-server/blob/docs/pm-testing-manual/docs/pruebas-manuales.md).

## Las nueve decisiones del análisis, con mi recomendación

| Decisión | Mi recomendación | Cómo ayuda al proyecto |
|---|---|---|
| 1. Registros vacíos y productos no alimentarios | No borrar ni mover registros. Clasificarlos en el informe externo; mostrar información parcial cuando haya identidad útil y excluir los no alimentarios de la evaluación. | La base queda intacta; no se presentan productos vacíos como completos. |
| 2. Ingredientes contaminados por OCR | Conservar el texto original, detectar basura y buscar una etiqueta mejor. Proponer una lectura corregida aparte; marcar como pendiente lo ilegible. | Evita que `mg/kg`, leyendas y errores de lectura se conviertan en ingredientes reales. |
| 3. Ingredientes estructurados | Mantener orden, ingredientes compuestos y subingredientes; registrar función e INS por separado, sin borrar alérgenos o fortificación. | Un nombre y su código INS pueden representar el mismo ingrediente sin contarlo dos veces. |
| 4. Carbohidratos ausentes | Buscar evidencia; si no aparece, mostrar “sin dato”. No obtenerlos despejando calorías. | No inventamos una cifra que puede ser falsa por fibra, polialcoholes u otros componentes. |
| 5. Ausente, cero y cantidad no significativa | Usar estados distintos: “sin dato”, número declarado, “cantidad no significativa” y “en conflicto”. Conservar también expresiones como “menor que”. | El usuario entiende qué dice realmente la etiqueta. |
| 6. Procedencia por campo y datos generados por IA | Crear evidencia en archivos locales: fuente, enlace, fecha de captura, valor, unidad, base y estado por campo. Los datos de memoria quedan sin verificar; `ai_enriched=false` tampoco prueba veracidad. | Cada corrección puede explicarse y revisarse. |
| 7. Variantes y presentaciones | Una identidad por código comercial; agrupar en familias solo para organizar y buscar. No copiar fórmula entre tamaños o sabores sin evidencia. | Evita asociar una tabla correcta al producto equivocado. |
| 8. Datos mínimos para aparecer y puntuar | Permitir una ficha parcial claramente señalada; exigir verificación de los datos que usa el motor para habilitar puntaje. | Se aprovecha lo que sí sabemos sin dar una falsa evaluación. |
| 9. Orden de trabajo | Presentación primero; validación y procedencia después; limpieza del motor y recalibración al final. | Hay una mejora comprobable inmediata, respetando D-92. |

Para normalizar identidades propongo una clave GTIN de 14 dígitos con ceros a la izquierda cuando corresponda, sin eliminar dígitos significativos ni confundir una caja con una unidad. El prefijo 779 no demuestra el país de fabricación ni verifica la fórmula vendida en Argentina. [GS1: GTIN](https://ref.gs1.org/guidelines/2d-in-retail/), [GS1: prefijo y origen](https://support.gs1.org/support/solutions/articles/43000734188-does-the-gs1-prefix-first-3-or-4-digits-of-the-ean-13-barcode-number-show-the-country-of-origin-).

Para ingredientes, Codex permite buscar nombres, sinónimos, INS y clases funcionales. Tener un INS no decide por sí solo cuánto debe restar en nuestro puntaje. La fortificación de harina de trigo tiene un contexto normativo propio; identificarla y decidir su tratamiento son tareas diferentes. Recomiendo preparar aliases y deduplicación con ejemplos de control, y revisar cualquier cambio de puntaje por separado. [Base oficial Codex](https://codex.fao.org/codex-texts/codex-online-databases/gsfa), [ANMAT: enriquecimiento de harina](https://www.argentina.gob.ar/anmat/regulados/alimentos/excepciones-y-denegatorias-ley-25630).

## Reglas del plan que conviene corregir antes de automatizar

El plan exige dos fuentes independientes en un apartado, pero permite una fuente de etiqueta o marca en otro. Dos lecturas de la misma foto sirven para controlar transcripción: siguen siendo una evidencia. Jumbo, Disco y Vea tampoco son tres confirmaciones independientes del mismo dato. [Plan del equipo](https://github.com/jereSava1/fitogenix-server/blob/docs/pm-testing-manual/docs/06-catalogo-confiable.md).

Mi propuesta, pendiente de tu decisión: para el catálogo automático, mantener una referencia de etiqueta o marca identificada y una corroboración independiente compatible; si falta, dejar pendiente. Registrar por separado “transcripción coincide”, “fuentes coinciden” e “identidad verificada”. Eso mantiene el criterio conservador de D-95/D-96 y aclara la contradicción sin declarar verificados nuestros casos por tener dos lectores.

También propongo estas correcciones a los controles:

- El ±20 % del rotulado no demuestra que dos páginas describan la misma fórmula. Comparar primero identidad, mercado, base, versión y redondeo; una diferencia no se aprueba automáticamente por estar debajo de ese porcentaje.
- No rechazar una etiqueta solo porque kcal y kJ no coincidan exactamente mediante 4,184. Los factores normativos de energía no se reducen a esa conversión.
- Usar la ecuación de energía como alerta orientativa, no como permiso para inventar nutrientes o rechazar toda diferencia.
- “Contiene sal” no demuestra que el sodio declarado deba ser mayor que cero. La declaración puede reflejar redondeo o cantidades no significativas.
- Aplicar controles de %VD solo con el perfil normativo correspondiente. Las tablas Raptor no deben rechazarse por usar automáticamente una referencia general de proteína que puede no corresponder a su categoría o mercado.

Estas precauciones se apoyan en las reglas de factores energéticos, tolerancias y declaración de cantidades no significativas del [Código Alimentario Argentino, capítulo V](https://www.argentina.gob.ar/sites/default/files/capitulo_v_rotulacion_actualiz_2025-06.pdf). No certifican el cumplimiento legal de las etiquetas estudiadas.

Los octógonos son un control adicional únicamente si tenemos los datos y condiciones necesarios. Una foto sin sellos visibles no prueba que el producto no los tenga; “sin TACC” no es un octógono de exceso. El adaptador actual lee certificaciones positivas y no demuestra que ya hayamos capturado las advertencias necesarias. [Manual oficial de rotulado frontal](https://www.argentina.gob.ar/sites/default/files/2024-12-manual_normativa_1.pdf).

D-94 todavía figura pendiente: propone cuatro macros siempre y otros nutrientes solo cuando superan cero. Recomiendo esos cuatro macros siempre, y un detalle adicional que permita ver ceros declarados y cantidades no significativas. Necesita tu aprobación y revisar la app. El umbral de 70 % de ingredientes reconocidos, incluidos los tres primeros, aparece en el plan; el motor actual también usa un límite absoluto de desconocidos. No son exactamente la misma regla. No lo cambiaría mientras D-92 siga vigente.

## Fuentes gratuitas y cuándo pagar

| Fuente | Uso recomendado | Límite relevante |
|---|---|---|
| Etiqueta y sitio del fabricante | Referencia de ingredientes y nutrición, vinculada al producto exacto | Puede faltar EAN, fecha o mercado; una tabla oficial sola no identifica nuestra fila. |
| Open Food Facts | Encontrar fotos y candidatos; contrastar información | Datos colaborativos. La API limita lecturas y búsquedas; para gran volumen se recomienda un volcado. |
| Cencosud/otros comercios | Hallar presentación, fotos y datos publicados | Identidad y base de medida deben comprobarse; una publicación repetida no es corroboración independiente. |
| SEPA | Candidato para identidad y presentación | La descarga enlazada devolvió 403 en esta investigación. No medí su cobertura actual ni descargué todo el conjunto. |
| Verified by GS1 | Verificar identidad comercial cuando esté disponible | La consulta básica tiene límites; el acceso avanzado/API depende del servicio o membresía. No garantiza una tabla nutricional completa. |
| Barcode Lookup | Probar cobertura de códigos difíciles antes de contratar | El plan inicial publicado cuesta US$99/mes por 5.000 consultas. La presencia de campos nutricionales no garantiza alimentos argentinos completos. |

Recomiendo presupuesto inicial de servicios nuevos: cero. Si las fuentes gratuitas dejan una necesidad concreta, diseñar primero un piloto de 50 códigos conocidos y medir identidad correcta, ingredientes, nutrición, evidencia y costo por producto utilizable. No creé cuentas, consumí pruebas pagas ni contraté nada.

Fuentes de esta comparación: [API OFF](https://openfoodfacts.github.io/openfoodfacts-server/api/), [SEPA](https://www.argentina.gob.ar/economia/industria-y-comercio/defensadelconsumidor/precios-sepa), [Verified by GS1](https://support.gs1.org/support/solutions/articles/43000734077-what-is-verified-by-gs1-), [GS1 Argentina](https://www.gs1.org.ar/Site/Servicios_Bootstrap5/Verified.html), [Barcode Lookup API y precios](https://www.barcodelookup.com/api).

Al usar OFF hay que conservar atribución y revisar las condiciones de reutilización antes de publicar un catálogo combinado. Su licencia distingue bases derivadas, colecciones y productos obtenidos de la base: no significa automáticamente publicar todas las tablas privadas del proyecto. Separar archivos tampoco elimina por sí solo las obligaciones. [Guía oficial OFF](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/), [texto de ODbL](https://opendatacommons.org/licenses/odbl/1-0/).

## Qué hacemos con los productos que ya investigamos

| Caso | Propuesta de tratamiento |
|---|---|
| Tonadita | Mantener tu referencia de 20 mg de sodio por 10 g. Coincide con 0,2 g por 100 g de la captura. No hace falta corregir ese valor en la base; tampoco aprueba automáticamente todo el producto. |
| Sacaan | Mantener la búsqueda cerrada y señalar los datos faltantes. No reconstruir una tabla completa desde un gráfico sin correspondencia confirmada. |
| Protein/Raptor | Conservar las cuatro tablas oficiales por separado. No asociarlas al EAN candidato mientras no conozcamos su sabor/presentación. Tener iguales números en dos sabores no los convierte en el mismo producto. |
| Bariloche | Conservar 80 g y 135 g como presentaciones distintas; dejar carbohidratos sin dato cuando no hay evidencia. Corregir el redondeo del sodio en la presentación del servidor. |
| Ilolay | Mantener las cuatro identidades y discrepancias por fuente; no copiar automáticamente fórmulas, porciones ni tamaños. |
| Doritos | Separar el error de mostrar 700 mg del conflicto entre 664 mg en la captura y 672 mg en la etiqueta. El primer arreglo no resuelve el segundo. |
| Rhodesia | Mantener los conflictos de datos y preparar deduplicación de ingredientes como propuesta. No publicar un nuevo puntaje estimado. |
| Monster | Conservar la evidencia por 100 ml y su contexto de mercado/fecha. No convertirla en datos por 100 g ni atribuirla automáticamente a la versión argentina actual. |

Las tablas de Raptor se contrastaron anteriormente con el [sitio oficial](https://raptornutricion.com/productos/raptor-protein-barras.html). Las demás evidencias y decisiones siguen en los nueve archivos de fase A. No se elevó ningún caso completo a “verificado” por esta investigación.

## Cómo avanzar sin escribir en Supabase

Primero: producir archivos de evidencia y propuestas versionados, con el dato original, el candidato, el motivo y las pruebas. Un archivo con una corrección no altera la app por sí mismo.

Después de aprobación: el servidor podría leer un archivo adicional de datos aprobados y usarlo al construir la respuesta. La lectura de Supabase seguiría intacta; solo entrarían candidatos con identidad, unidad y base verificadas. Habría que resolver actualización, conflictos, versiones y reversión antes de usarlo. No propongo introducirlo silenciosamente como cambio de presentación: sustituir datos usados para puntuar requeriría otra aprobación y respetar D-92.

Para escalar: lotes de 50 candidatos con consultas limitadas, caché, reintentos y presupuesto; evidencia original preservada y salida solo a archivos. Medir cobertura verificable, conflictos, datos ausentes, identidad dudosa, errores de transcripción y costo. No prometer que el proceso resolverá el catálogo entero: los productos sin evidencia suficiente seguirán pendientes.

La documentación de OFF distingue valores por porción y por 100 g; las claves sin sufijo requieren interpretar su base. La futura normalización debe conservar esa información y no asumir que todo número significa “por 100 g”. [Esquema oficial de nutrición OFF](https://openfoodfacts.github.io/documentation/docs/Product-Opener/schemas/schemas/product_nutrition/).

## Primer cambio concreto que recomiendo aprobar

**Alcance:** preparar en una nueva rama de trabajo una corrección de `extractNutrition` y de la presentación de categorías en el servidor. Convertir sodio/colesterol antes de redondear; validar números finitos; conservar cero y ausencia; evitar romper letras acentuadas. Mantener la base de medida y la selección de datos actuales: su rediseño se propone por separado. No implementar en este primer cambio la limpieza del nombre, el merge, la validación automática, cambios de contrato o pantalla ni el motor del puntaje.

**Resultado esperado:** los valores 0,046 / 0,362 / 0,664 g se muestran como 46 / 362 / 664 mg; 0,0022 g de colesterol como 2,2 mg; cero sigue siendo cero y ausencia sigue siendo ausencia. Tonadita sigue mostrando 200 mg por 100 g. Las categorías mantienen acentos legibles.

**Comprobación requerida:** pruebas enfocadas de conversión, datos inválidos y categorías; comparar respuestas de los casos de control y comprobar igualdad del puntaje y su desglose; ejecutar los controles obligatorios del repositorio. Preparar el cambio y su diferencia para revisar, sin desplegar ni publicar hasta la confirmación correspondiente.

La aprobación anterior para subir nueve documentos no autoriza este cambio en código. Este documento lo deja concreto para que puedas decidirlo.

## Tu parte, paso a paso

1. Decidir si aprobás preparar ese primer cambio del servidor. No necesitás ejecutar comandos ni subir más archivos ahora.
2. Revisar los ejemplos “antes/después” que te entregue y decir si el resultado te sirve. Podés hacerlo en palabras simples.
3. Para el siguiente bloque, decidir entre dejar pendientes los datos dudosos —mi recomendación— o autorizar una regla alternativa explícita; y aprobar el detalle de ceros/cantidades no significativas en la tabla.
4. Cuando exista acceso al código de la app, revisar conmigo los cambios de pantalla. No hace falta que consigas ese enlace para continuar con el servidor y la validación local.
5. Más adelante, aprobar por separado cualquier publicación, despliegue o cambio que afecte puntajes. Supabase seguirá siendo solo lectura salvo que vos cambies expresamente esa regla.

No necesitás comprar una API ni investigar uno por uno todos los productos. Mi parte es buscar, comprobar, preparar y explicarte las alternativas; tu parte es decidir el comportamiento del proyecto y aprobar los cambios concretos.
