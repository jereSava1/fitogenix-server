# Barrido autorizado: avance y obstáculo técnico

**HISTÓRICO RECTIFICADO:** Guille aclaró posteriormente que el permiso del dueño no existe y fue un malentendido. El título y relato siguientes describen el estado informado al realizar esta tanda; no son autorización vigente. Scraping detenido. La decisión actual es evaluar una prueba de API antes de contratar el barrido completo. Leer `BARCODE-PERMISO-CORREGIDO-Y-API-2026-10-08.md`; no usar el borrador de habilitación al final como próximo paso actual.

## Autorización y estado

Guille confirmó en el chat que tienen permiso del dueño de Barcode Lookup para el barrido completo. Se acepta esa autorización y se retomó la búsqueda sin pedir confirmación por tanda. El pendiente de permiso del informe anterior queda superado. La autorización no altera las restricciones del proyecto: Supabase solo lectura, main intacto y revisión antes de publicar.

La autorización de uso y la habilitación técnica son cuestiones distintas. Tras completar una tanda de diez códigos en el navegador, se probó una solicitud directa para preparar la ejecución por tandas. El sitio devolvió **HTTP 403** y una página titulada **Barcode Lookup Security Verification**. No se inició una segunda solicitud directa ni un trabajador en segundo plano.

El 403 corresponde al acceso directo probado, no demuestra que todas las consultas en navegador estén bloqueadas. La tanda en navegador sí terminó. No se intentó resolver un CAPTCHA, cambiar de IP, rotar identidades o eludir la verificación. El resultado se conserva como intento pendiente; no se marca como ficha ausente.

## Resultado de la tanda nueva

| Código | Nombre en nuestro catálogo | Resultado |
|---|---|---|
| 7791885000515 | Sardinas Cumaná | Sin ficha |
| 7791540045202 | Vino Blanco Facundo | Sin ficha |
| 7791528000308 | Helado Ice Cream Balde V/gustos | Sin ficha |
| 7791720035481 | Café instantáneo suave Carrefour Classic en frasco | Sin ficha |
| 7798024420968 | Anana Fizz Calingasta | Sin ficha |
| 7798078450126 | Arroz blanco Vanguardia | Ficha encontrada |
| 7790670051329 | Medallón de carne sabor cebolla Paty, 2 unidades de 200 g | Sin ficha |
| 7790524000084 | Mix almendras, castañas de cajú y maní | Sin ficha |
| 7790197160566 | Vino Navarro Correas Bonarda | Sin ficha |
| 4710900602605 | Frasco de acrílico con tapa hermética mediano | Sin ficha |

La [ficha de arroz Vanguardia](https://www.barcodelookup.com/7798078450126) muestra el código exacto, nombre compatible, origen Argentina e ingrediente «Arroz Blanco». No muestra una tabla nutricional visible. Es información candidata de ingredientes; no se aplicó a la base ni se afirma verificación independiente de la etiqueta. Los códigos sin ficha no se declaran incorrectos.

Los nombres completos y códigos originales se conservan en la cobertura individual. La tabla anterior acorta algunos nombres para facilitar su lectura. Se mantuvieron también artículos ajenos a la nutrición, como el frasco, porque el pedido fue recorrer todos los códigos. No se evalúan sus faltantes como errores nutricionales.

## Intento de acceso directo

- Código: **7790387113310**, nuestra fila «Yerba Mate».
- URL solicitada: https://www.barcodelookup.com/7790387113310
- Respuesta: **403**, contenido HTML, título **Barcode Lookup Security Verification**.
- Momento: 2026-10-09 01:48:11 UTC, equivalente al 8 de octubre a las 22:48:11 en Argentina.
- No hubo un encabezado Retry-After que indicara una espera concreta.

La causa precisa del filtro no está demostrada: el 403 no identifica si depende de IP, agente de acceso u otra regla. No se afirma que una espera determinada lo resuelva. BLOQUEO-ACCESO-DIRECTO.json conserva los datos observados, sin credenciales.

## Cobertura acumulada

| Estado | Códigos |
|---|---:|
| Total del catálogo capturado | 81.444 |
| Consultas con respuesta de ficha o ausencia | 25 |
| Fichas encontradas | 9 |
| Sin ficha en la fuente | 16 |
| Intento pendiente por HTTP 403 | 1 |
| Sin intentar | 81.418 |
| Pendientes totales, incluido el 403 | 81.419 |

Estos conteos incluyen 11 códigos del piloto, cuatro de la continuación anterior y los diez de esta tanda. No se extrapola la proporción encontrada al resto del catálogo. Tampoco se declara verificada la identidad o nutrición de todas las fichas encontradas.

## Continuación preparada

COBERTURA-CADA-CODIGO.ndjson tiene un estado por cada fila. TANDAS-PENDIENTES.ndjson contiene **1.629 tandas de hasta 50**, con **19 códigos en la última**. El código bloqueado permanece en la primera tanda pendiente. Las tandas están preparadas, no ejecutadas.

Se comprobó que los diez códigos nuevos estaban pendientes, que pertenecen a la captura y que no repiten resultados previos. Las 25 respuestas resueltas más los 81.419 pendientes cubren las 81.444 filas; las tandas no omiten ni duplican registros. Las entregas anteriores permanecen intactas para conservar la historia.

Para avanzar con el acceso directo, el dueño puede habilitar el cliente autorizado o indicar un mecanismo técnico de acceso sin API comercial, conforme al permiso ya otorgado. No hace falta volver a autorizar cada tanda. El proyecto no está ejecutando un barrido en segundo plano mientras ese acceso sigue sin resolverse.

Texto concreto que Guille puede pasarle al dueño:

> Tenemos permiso para consultar nuestro catálogo. Al probar un GET a https://www.barcodelookup.com/7790387113310, el 8 de octubre de 2026 a las 22:48:11 de Argentina, recibimos HTTP 403 con título “Barcode Lookup Security Verification”. Usamos el identificador de cliente `FitogenixCatalogAudit/1.0 (owner-authorized read-only lookup)`. ¿Podés habilitar ese acceso autorizado o indicar el mecanismo técnico que debemos usar? Queremos trabajar por tandas, con una sola solicitud a la vez, y respetar los límites que nos indiques.

Es un borrador para enviar; no se contactó al dueño desde herramientas. No se envían claves de Supabase, datos de acceso al proyecto ni la copia íntegra de la base.

## Archivos y revisión

- TANDA-NAVEGADOR-AUTORIZADA.json: diez observaciones nuevas y declaración de autorización.
- BLOQUEO-ACCESO-DIRECTO.json: prueba concreta del 403.
- RESUMEN-AVANCE.json: conteos, comprobaciones y estado técnico.
- COBERTURA-CADA-CODIGO.ndjson y TANDAS-PENDIENTES.ndjson: continuidad completa.
- REGISTRO-AUTOAPROBACIONES.md: decisiones locales y permiso recibido.

No hubo nuevas solicitudes a Supabase en esta continuación, escrituras en tablas, cambios en main ni publicación. Ningún dato encontrado se aplicó a productos.
