# Barcode Lookup: permiso rectificado y evaluación de API

## Estado vigente

Guille aclaró que la afirmación de permiso del dueño fue un malentendido: **no tenemos permiso para el barrido automatizado de páginas**. Se detiene esa línea de trabajo. La documentación anterior de la tanda se conserva como historia rectificada, no como autorización vigente. No hay un proceso activo ni consultas nuevas de productos en esta continuación.

Los 25 resultados observados y el HTTP 403 se conservan. No se cambia una cifra para corregir el permiso. Supabase sigue solo lectura; main intacto y revisión antes de publicar. Recomendar la API no autoriza comprarla, crear una cuenta, aceptar sus condiciones ni usar una clave.

## ¿La muestra sugiere que no vale la pena pagar?

**Sugiere cautela; no justifica comprar el barrido completo ahora.** No demuestra que la API sea inútil: revisamos páginas públicas, no respuestas reales de la API, y la muestra es pequeña y no aleatoria.

| Evidencia local | Resultado | Interpretación |
|---|---|---|
| 25 códigos con respuesta | 9 fichas, 16 ausencias | 36 % de fichas en esa muestra, no una estimación del catálogo. |
| Piloto de 11 casos conocidos | 7 fichas, 4 ausencias | Selección intencional para investigar problemas concretos. |
| Continuaciones de 14 códigos | 2 fichas, 12 ausencias | Orden de la captura; incluye alcohol y un artículo de hogar. |
| Comparación nutricional inicial | 35 campos: 15 coincidencias, 6 diferencias y 14 candidatos faltantes | Coincidir no significa aportar algo nuevo ni verificar procedencia. |
| Base nutricional de esos 35 campos | No confirmada para aplicación | Unidades/base siguen requiriendo evidencia. |
| Rhodesia | Ficha mezcla alimento con LEGO/juguete | No copiar ni validar por esa ficha. |
| Vino Ricardo Santos | Ficha sin nutrición visible | Aporta identidad general, no resuelve nutrición. |
| Arroz Vanguardia | Ingrediente «Arroz Blanco», sin nutrición visible | Nuestra captura ya contiene «ARROZ BLANCO»: no es un ingrediente nuevo que complete un faltante. |

La comparación de arroz se hizo contra su fila original de la captura completa, origen OFF. No se deduce el ingrediente desde el nombre. Repetir lo que ya tenemos puede apoyar una comparación, pero no demuestra independencia entre fuentes.

No confirmamos en este trabajo un producto nuevo con nutrición completa, identidad y base verificadas listo para una eventual incorporación. Esto no equivale a afirmar que los candidatos son inútiles: algunos pueden servir después de contrastar etiquetas y fórmulas.

Para Fitogenix, el dato relevante no es cuántas páginas aparecen: es **cuántos productos mejoramos con información que nos faltaba y podemos usar con confianza**. Pagar cambia la modalidad de acceso, no garantiza que desaparezcan los errores, faltantes o dudas de la fuente.

## Oferta oficial consultada

Precios publicados al revisar esta continuación; verificar de nuevo al contratar:

| Plan | Llamadas mensuales | USD/mes |
|---|---:|---:|
| Starter | 5.000 | 99 |
| Advanced | 25.000 | 249 |
| Professional | 100.000 | 499 |

El sitio ofrece prueba de API. [Planes y prueba oficiales](https://www.barcodelookup.com/api).

La API documenta `ingredients` y `nutrition_facts` como texto, y consultas de hasta diez códigos por solicitud. Eso requiere parsing y no garantiza base nutricional explícita. [Documentación oficial](https://www.barcodelookup.com/api-documentation).

Para 81.444 códigos, una solicitud por código serían 81.444 solicitudes; agrupando diez serían 8.145, antes de reintentos. No asumir que esos lotes descuentan una sola unidad de cuota: confirmar facturación por lote, respuestas sin resultado y cupo de prueba con el proveedor. No se presenta un plan concreto como suficiente para todo el catálogo sin esa aclaración. Además, el catálogo completo incluye artículos que no son alimentos y no todos los códigos son compatibles con el endpoint.

Confirmar también condiciones de conservación/reutilización de datos al terminar una suscripción: las [condiciones publicadas, sección 4](https://www.barcodelookup.com/terms-and-conditions) prevén eliminación de Product Data al terminarla. No presupuestar «pagar un mes y conservar todo para siempre» sin aclarar por escrito la modalidad/licencia aplicable al proyecto.

## Recomendación concreta

**Primero prueba oficial; después decidir si pagar.** Si el cupo gratuito no alcanza y el equipo quiere ampliar el piloto, considerar el plan inicial como experimento con presupuesto explícito, nunca como compra automática del catálogo completo. Si el resultado es pobre, cerrar esa evaluación y priorizar otras fuentes/etiquetas.

Preparar 100–200 alimentos realmente dentro del alcance, condicionados al cupo disponible. Seleccionarlos reproduciblemente entre productos con datos faltantes, repartidos por origen y marcas. Excluir alcohol, higiene, hogar, mascotas e identidades dudosas; no mandar la cola original de 81.419 de forma indiscriminada. Conservar unos controles conocidos aparte para comprobar el parsing de la API. Registrar el método antes de mirar los resultados para no elegir solo éxitos.

El piloto tiene que medir por separado:

1. Ficha encontrada con identidad compatible.
2. Ingredientes nuevos utilizables respecto de nuestra captura.
3. Nutrientes faltantes aportados, con unidades y base claras.
4. Conflictos, datos repetidos y respuestas que siguen necesitando etiqueta.
5. Productos mejorados con evidencia, costo real por mejora y tiempo de revisión.

Un ejemplo puramente ilustrativo: si se gastaran USD 99 y solo cinco productos quedaran mejorados con evidencia, serían USD 19,80 por mejora, sin contar revisión. Si fueran cincuenta, USD 1,98. No es una proyección de nuestra muestra ni un costo marginal por llamada; muestra por qué conviene medir utilidad antes de escalar.

Todavía no se fijó un umbral económico universal ni se prometió una tasa de mejora. El equipo decidirá si los resultados justifican el presupuesto según sus necesidades. La API puede ser más valiosa para nombre/marca/imagen que para nutrición: evaluar cada objetivo por separado.

## Qué cambió en la entrega

- Estado consolidado, guía de agentes y resumen actual: permiso inexistente, scraping detenido, evaluación de API pendiente.
- Informe anterior de la tanda: marcado como histórico rectificado.
- Registro de decisiones: corrección explícita, sin borrar cómo se llegó al estado anterior.
- Paquete nuevo: reemplaza al anterior para revisión/publicación; los respaldos conservan historia identificada.

No se compró ningún plan, no se creó cuenta, no se usó la API ni se escribió en Supabase/GitHub. Las herramientas locales B/C y la auditoría de 81.444 filas siguen siendo válidas y no dependen de contratar esta fuente.
