# Declaraciones del envase y fuentes complementarias — revisión de B

Fecha: 2026-10-08. Preparado localmente por pedido de Guille. No implementa una nueva función de advertencias, un contrato HTTP nuevo o una integración con Barcode Lookup. No se hizo consulta a su API ni cruce masivo. No modifica tablas, `main`, puntaje o `fitogenix-agents`.

Actualización posterior: Guille descartó la API y pidió consultar solo fichas web correspondientes al catálogo. Se comprobaron dos páginas públicas por navegador, sin API. Los resultados y el detector b-2 están en [FASE-B-MEJORAS-Y-PILOTO-WEB.md](FASE-B-MEJORAS-Y-PILOTO-WEB.md). Las menciones a un futuro piloto por API más abajo describen la propuesta anterior; no son el plan autorizado actual.

## Corrección de alcance: conservar las advertencias

Guille indicó que `CONTIENE DERIVADOS DE LECHE` es información útil y no debe descartarse, y aclaró que no puede autorizar por sí solo una nueva función de advertencias. Por ahora se conserva el texto original completo en la base y en el funcionamiento actual del sistema. El candidato de Tonadita mostrado en B no es un texto aprobado para reemplazar el original.

El informe de B ya guarda la declaración completa en `preserved_declarations` y el original en `original`. Esto permite estudiar una futura separación sin perder información. No tratar la declaración como un ingrediente que merezca una severidad o deducción del puntaje. Tampoco crear un apartado visual, un endpoint o un campo HTTP por asumir que esta conversación lo aprobó.

Ejemplo para una futura revisión del equipo, no implementado: lista `Crema de leche pasteurizada, sal`; declaración del fabricante `CONTIENE DERIVADOS DE LECHE.`. Esa declaración no es una recomendación médica, no verifica todos los alérgenos del producto y su ausencia no prueba ausencia de alérgenos. No deducir declaraciones que no estén en la evidencia.

## Qué se comprobó en el backend real

- `src/modules/catalog/routes/lookup.schema.ts` y `lookup.route.ts`: entrada `POST /v1/products/lookup`, con `query` por nombre o código. `getProduct.route.ts` expone el detalle por ID.
- `src/modules/catalog/application/productResponse.ts` → `toProductDetail`: crea el detalle; `ingredients` se obtiene del mismo `scoreProduct(raw)` que produce el puntaje. No sustituir ese input con la limpieza de B para presentar otra lista sin comprobar su relación con el puntaje.
- `src/modules/catalog/routes/product.schema.ts` → `ProductDetailSchema`: declara ingredientes y nutrición; no declara `warnings`, `declarations` o un apartado de alérgenos. El serializador no sirve campos agregados sin cambiar el schema.
- `docs/arquitectura.md` y `docs/adr/0011-contrato-http-fuente-unica.md`: contrato TypeBox del servidor → OpenAPI generado → tipos del cliente. ETL fuera del runtime; el servidor no consulta proveedores externos al resolver un escaneo. `src/` no importa `etl/` o `scripts/`; funciones de dominio puras y fronteras de módulos verificadas.

No se encontró un `AGENTS.md` en el checkout o en los ancestros consultados. Se leyeron `fitogenix-agents/agents/03-agente-backend.md` y `08-agente-arquitecto.md` en GitHub. Exigen coordinar cambios del contrato entre servidor y app, declararlos y probarlos. Algunas rutas y el mecanismo de contrato descritos allí son anteriores a la estructura actual; usar el código y ADR-0011 como referencia técnica vigente, sin copiar las rutas antiguas ni ejecutar sus procesos de base.

Fuentes del equipo: [Backend](https://github.com/jereSava1/fitogenix-agents/blob/main/agents/03-agente-backend.md), [Arquitecto](https://github.com/jereSava1/fitogenix-agents/blob/main/agents/08-agente-arquitecto.md).

## Cómo dejar preparado el trabajo sin crear la función

Usar este Markdown para la decisión, límites y guía de integración; el JSON de propuestas de B conserva textos, declaraciones y posiciones. CSS define aspecto visual, no procedencia ni lógica del backend. No generar un componente o módulo de producción sin un consumidor autorizado.

Cuando el equipo apruebe la función, diseñar primero el tipo de declaración, texto original, procedencia y comportamiento cuando no hay evidencia. Definir si se obtiene de datos crudos o de evidencia validada y cómo se conserva sin cambiar las tablas actuales. No prometer que existe una persistencia de declaraciones aprobada hoy.

Después implementar una función pura en la capa de dominio de `catalog`, composición en aplicación, schema TypeBox, contrato generado y changelog; adaptar el consumidor de la app con sus tipos generados y pruebas. No importar directamente este script de ETL en `src/`. Mostrar pruebas de conservación de declaraciones y de no alterar el puntaje ni duplicar un mismo dato. Es una guía pendiente, no un contrato aprobado; integrar una funcionalidad no es seleccionar un archivo Markdown.

## Barcode Lookup: uso propuesto y límites

La API permite buscar por código y devuelve identidad, marca, imágenes y campos de ingredientes y nutrición. Estos últimos son strings, no una tabla garantizada con unidades, porción, fórmula vigente o fuente por nutriente. Consultar un código no valida automáticamente todos sus campos.

El resultado se clasificaría por campo y producto:

| Resultado de la consulta | Interpretación |
|---|---|
| Código encontrado y nombre, marca, sabor y tamaño compatibles | Identidad corroborada por una fuente adicional; no se aprueba toda la nutrición |
| Valor comparable coincide | Coincidencia de ese campo; registrar unidad, base, evidencia y límites de independencia |
| Código encontrado pero identidad o valores difieren | Conflicto para revisión, no elección automática |
| Código sin ficha | `no_encontrado_en_fuente`; no prueba que el código esté mal |
| Ficha sin nutrición o sin base/unidad clara | No comparar números como equivalentes; preservar ausencia/ambigüedad |
| Error de red, cuota o acceso | `consulta_no_completada`; no confundir con ficha ausente |

Conservar códigos como texto, incluidos ceros iniciales. No corregir una identidad o copiar fórmulas por coincidencia parcial de nombre. Barcode Lookup agrega datos de fabricantes, distribuidores, comercios y aportes comunitarios: el acuerdo con otro sitio no demuestra que sean dos fuentes independientes.

La API requiere su propia clave. La documentación permite hasta diez códigos por consulta de lote; eso no determina por sí solo el costo total del plan. Sus términos prohíben scraping/recopilación automatizada de la web fuera del uso de la API y restringen automatizar cuentas de prueba gratuitas. No se creó una cuenta, contrató un plan o envió códigos a su API.

Fuentes oficiales consultadas: [Documentación API](https://www.barcodelookup.com/api-documentation), [API comercial](https://www.barcodelookup.com/api), [Términos](https://www.barcodelookup.com/terms-and-conditions), [Origen general de datos](https://www.barcodelookup.com/).

## Continuidad recomendada

Mantener B centrada en el detector y preservar declaraciones; ampliar pruebas contra textos reales y falsos positivos. Dejar la función visual de advertencias como propuesta para Jere/equipo. Como investigación complementaria, definir una muestra pequeña de códigos existentes y comparar cobertura de identidad y nutrición antes de decidir un servicio pago o una ejecución grande. No pasar directamente de los controles a consultar todo el catálogo. El piloto requiere acceso a la API bajo las condiciones del proveedor y presupuesto autorizado; no colocar una clave en mensajes o archivos de entrega.

Todo resultado del cruce queda en archivos locales para revisión, no en Supabase. No añadir Barcode Lookup al flujo de escaneo: mantener la arquitectura de catálogo y ETL separados. La integración, publicación y escalado permanecen pendientes.
