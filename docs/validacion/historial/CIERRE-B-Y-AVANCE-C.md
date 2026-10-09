# Entrega conjunta: cierre técnico de B y avance de C

2026-10-08. Rama local `revision/fase-b-texto-ingredientes-2026-10-08`. Este informe es el estado vigente y reúne el trabajo autorizado mientras Guille no estaba. Sin commit, push, escritura en Supabase o cambios a main. Las entregas anteriores se conservan.

## B terminado en el alcance autónomo

Quedaron implementados y probados el detector, la conservación de originales/advertencias, las propuestas de limpieza, el comparador por código y la separación de decisiones. Se ejecutaron sobre los controles disponibles y sobre los 200 registros del fixture que ya existe en el repositorio. No se conectaron al motor o los jobs del ETL. No se afirma que todo el catálogo esté limpio ni que los casos ambiguos hayan sido resueltos.

El detector puede proponer retirar un rótulo claro o la frase documentada sobre colesterol cuando no hay ambigüedad. Ante OCR, INS dudoso, estructura incompleta u otras señales, conserva el texto y remite a revisión. La advertencia de leche permanece; no se añadió una funcionalidad HTTP de advertencias. Las cantidades legítimas de ingredientes también permanecen.

Las 15 coincidencias numéricas quedan aceptadas por Guille para validar el número, con la fuente y campo registrados. La base/formulación que no está explícita continúa pendiente. Los 14 candidatos faltantes, la ficha conflictiva de Rhodesia y sus diferencias están apartados: no se eligió una alternativa ni se transfirió una cifra a tablas.

En los 200 registros locales: 154 sin hallazgos de las reglas, 26 requieren revisión, 18 sin ingredientes y 2 conservados sin limpieza. No hubo listas candidatas para sustituir recetas en esta muestra. No se asigna una tasa de precisión: no tenemos etiquetas revisadas para todos esos casos. La revisión sobre 200 es del fixture, no una consulta de la base actual.

## C iniciado y funcionando como auditoría local

Se implementó un estándar de formato con nombres compatibles con NutritionFacts del backend y un diagnóstico adicional. Conserva datos originales y valores ausentes. Convierte gramos de sodio/colesterol a miligramos antes de presentar, no deriva sodio de sal ni copia candidatos de la web. No infiere 100 ml a partir de 100 g.

El diagnóstico señala valores inválidos, bases ausentes, metadata de unidad dudosa, cifras fuera de los rangos existentes del ETL y relaciones numéricas inconsistentes. Las tolerancias de 0,1 g entre componentes/totales y 1 g para suma de macros son criterios técnicos provisionales para no alertar por pequeñas diferencias de redondeo; no validan etiquetas ni reparan valores. La metadata `_unit` puede describir el original y no el número normalizado: un desacuerdo se deja para aclaración, sin reconvertir dos veces.

En la muestra: 19 registros completos por los ocho campos requeridos de formato; 15 con alertas. Se encontraron 19 alertas de unidad, una de suma de macros y dos de base ausente (un registro puede tener varias). Solo 9 cumplen completitud y los controles locales juntos; siguen sin declararse verificados por etiqueta. No se cambió el criterio del servidor ni se rechazan productos de la app por estas reglas.

## Pruebas y evidencia

72 pruebas locales pasaron: 39 detector, 9 comparador, 13 preparación B/C y 11 auditoría/diagnóstico. También tipos, dependencias y código no utilizado. Las pruebas no usaron claves reales y tuvieron red externa bloqueada. Los nueve archivos originales de A se conservan por hash. El reporte de 200 conserva cada objeto original, índice local y hash de la fuente. Las identidades locales son posiciones del archivo: no son códigos inventados.

El fixture se organiza en cuatro grupos locales de 50 sin pérdida de entradas. Es preparación para revisión; no inició aplicación D ni actualización alguna. No se repitió la suite del servidor porque no hay cambios nuevos en `src/`, contratos o dependencias.

## Qué se saltó y por qué

| Paso | Motivo para apartarlo | Qué queda listo |
|---|---|---|
| Resolver faltantes y ficha de Rhodesia | Guille pidió conversar con el equipo después | Lista con cifras, campos y enlaces en DECISIONES-PENDIENTES-BC.md |
| Confirmar sabores, fórmulas y OCR ilegible | Falta evidencia suficiente | Se conservan originales y los pendientes de A |
| Confirmar bases y metadata de unidades | Requiere etiquetas/procedencia de normalización | Diagnóstico fila por fila, sin corregir |
| Decidir campos obligatorios definitivos y reglas C | Criterio técnico provisional requiere revisión del equipo | ESTANDAR-NUTRICIONAL-C-PROPUESTO.md y pruebas |
| Medir el catálogo actual completo | No se dispone de una captura local completa; la muestra del repo no la sustituye | Herramienta ejecutable para arrays de exportación local, hasta 20 MB por archivo |
| Integrar al servidor y recalibrar scoring | Cambiar ingredientes de entrada puede alterar puntajes; falta revisión de propuestas | Herramientas aisladas y guía para Jere |
| Publicar, mergear o desplegar | Sigue vigente revisión humana antes de subir | Paquete concreto, manifiesto y resultados reproducibles |

No hace falta que Guille resuelva estos pasos ahora. No se marcaron como realizados ni se pidieron permisos mientras estaba ausente. El permiso de autonomía se aplicó al trabajo técnico local, no a inventar evidencias o escribir en tablas.

## Guía breve para Jere

1. Revisar esta entrega y los pendientes. Preservar la entrega anterior R-01/categorías; este paquete no la reemplaza.
2. Trabajar en una rama separada. Copiar las herramientas/documentos revisados a sus rutas; ninguna importación de `etl/` desde `src/`.
3. Con Node 22 y salidas nuevas, ejecutar los comandos del README B y del estándar C. La auditoría ampliada se ejecuta así:

```bash
mkdir -p work
node etl/validacion/auditar-catalogo-bc.mjs src/modules/scoring/domain/fixtures/catalog-sample.json work/auditoria-muestra-bc-nueva.json
node --test etl/validacion/detectar-texto-b.test.mjs etl/validacion/comparar-fuentes-b.test.mjs etl/validacion/preparar-revision-bc.test.mjs etl/validacion/auditar-catalogo-bc.test.mjs
```

4. Antes de extender a una exportación nueva, conservar procedencia, fecha y códigos como strings. El auditor acepta un array local de filas con `product_name`, `ingredients_text`, `nutriments` y barcode opcional. No aceptar índices del fixture como IDs de Supabase ni dividir identidades por nombre.
5. Resolver las decisiones de C y la revisión de casos antes de integrar. Si cambia `src/`, verificar rutas, contrato y puntajes con las suites correspondientes. No ejecutar jobs que escriban en tablas bajo la autorización actual.

El estado real es: B cerrado técnicamente para diagnóstico/propuestas locales; C iniciado con implementación local; D solo preparado en grupos. El catálogo no fue corregido ni publicado.
