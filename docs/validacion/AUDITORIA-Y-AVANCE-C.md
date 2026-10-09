# Auditoría del trabajo y siguiente avance C

2026-10-08. Estado vigente posterior a CIERRE-B-Y-AVANCE-C.md. Rama local separada; sin commit/push, acceso nuevo a Supabase o cambios a main.

## Conclusión

El trabajo respeta las barreras de originales, ausencia de escrituras y herramientas aisladas. La revisión encontró un error de atribución de aprobación humana y lo corrigió. Por tanto, la versión anterior no se presenta como completamente correcta sin esa salvedad. La auditoría es revisión de código, regresiones y consistencia de archivos, no una segunda revisión humana de 200 etiquetas.

### Error corregido

`prepareReview` aceptaba cualquier coincidencia de una entrada futura y atribuía esa aceptación a Guille. La prueba con un caso sintético nuevo produjo una aceptación humana antes de corregir y cero después. Ahora hay una política explícita con los 15 triples código/campo/valor revisados. Una cifra distinta, campo nuevo o código fuera del alcance queda como `coincidencia_nueva_pendiente`; nunca se atribuye a Guille por el simple hecho de coincidir.

Se conservan las 15 aceptaciones reales y los 14 candidatos faltantes originales. Tampoco se altera el alcance numérico de esa validación: no prueba base/formulación, independencia de fuente o autorización de escritura. La ficha conflictiva sigue apartada.

### Mejora de identidad

El auditor de exportaciones ahora señala EAN repetidos en un archivo, conservando ambas filas y sus recetas. Antes los IDs por posición mantenían las filas distintas, pero no advertían la duplicación de código. Una prueba de dos recetas con un mismo EAN comprueba que no se mezclan. En el fixture de 200 no hay códigos disponibles para comprobar duplicados; cero alertas allí no demuestra unicidad de EAN en el catálogo.

## Revisión de resultados anteriores

Se reprodujeron las métricas sobre los mismos 200 registros: 154 sin hallazgos del detector, 26 con revisión necesaria, 18 sin ingredientes y 2 conservados sin limpieza. Se mantienen 19 completos de formato, 15 filas con alertas nutricionales y 9 completos sin alertas de estas reglas. Estos números son del fixture; no son cobertura de Supabase ni tasas de verificación.

La nueva entrega verifica hash de fuente, objetos originales, fragmentos y conservación de los nueve archivos de A. Las herramientas no importan clientes de servicios ni ejecutan jobs ETL. No hubo modificaciones nuevas a `src/`, contrato HTTP o dependencias. Las pruebas se ejecutaron con red externa bloqueada y claves ficticias. No se atribuye a este paso una suite completa del servidor o revisión externa de fuentes.

## C: siguiente implementación realizada

`normalizar-panel-c.mjs` convierte paneles estructurados cuando se conocen explícitamente la porción y sus unidades. No lee cifras de OCR ni adivina bases. Acepta base en g o ml, conserva esa dimensión y calcula por 100 de la misma unidad. Convierte g/mg según el campo; kcal conserva kcal. Rechaza base ausente, cantidad inválida, campo repetido, unidad incompatible y desbordamiento. No convierte kJ a kcal, 100 g a 100 ml ni añade ceros a nutrientes ausentes.

| Evidencia del ejemplo | Cálculo | Resultado | Estado |
|---|---|---|---|
| Tonadita, sodio 20 mg por 10 g | 20 × 100 / 10 | 200 mg por 100 g | Conversión comprobada; etiqueta aportada por Guille, sin escritura |
| Tonadita, energía 75 kcal por 10 g | 75 × 100 / 10 | 750 kcal por 100 g | Conversión comprobada, sin inferir otros campos |
| Tonadita, grasas 8,3 g por 10 g | 8,3 × 100 / 10 | 83 g por 100 g | Conversión comprobada |
| Tonadita, saturadas 5 g por 10 g | 5 × 100 / 10 | 50 g por 100 g | Conversión comprobada |
| Doritos, referencia de Guille: 168 mg por 25 g | 168 × 100 / 25 | 672 mg por 100 g | Referencia pendiente; diferencia de 8 mg frente a captura 664 no resuelta |

`conversion_checked=true` indica cálculo sobre los valores explícitos suministrados. No significa que se confirmó una fórmula/etiqueta, ni autoriza aplicar el resultado. Se conserva la procedencia y el panel de entrada. La referencia Doritos fue expresada como supuesta por Guille y sigue con ese carácter; no se elevó a verdad nutricional definitiva.

## Pruebas y ejecución

82 pruebas pasaron: 39 detector, 9 comparador, 14 preparación/revisión, 12 auditoría local y 8 normalizador. Tipos, dependencias y código no utilizado: salida 0. El caso de atribución indebida tiene prueba de regresión; también se prueban EAN repetidos, unidades, base de líquidos, pérdida de originales, números inválidos y rechazo de sobrescrituras.

Desde la raíz del repositorio, Node 22 y salida nueva:

```bash
mkdir -p work
node etl/validacion/normalizar-panel-c.mjs etl/validacion/paneles-c-muestra.json work/paneles-c-revision-nueva.json
node --test etl/validacion/detectar-texto-b.test.mjs etl/validacion/comparar-fuentes-b.test.mjs etl/validacion/preparar-revision-bc.test.mjs etl/validacion/auditar-catalogo-bc.test.mjs etl/validacion/normalizar-panel-c.test.mjs
```

Los demás comandos permanecen en el README y el estándar C. Los ejemplos de panel requieren revisión de procedencia antes de cualquier uso en datos de producto. La herramienta solo produce JSON local; no se integra a rutas, scoring o jobs del servidor.

## Estado y pendientes

B conserva el cierre técnico para diagnóstico/propuestas locales, con la corrección de atribución incorporada. C ahora incluye estándar, diagnóstico y conversión explícita de porciones. Sigue pendiente acordar el estándar definitivo y la base de líquidos, verificar etiquetas, revisar candidatos/conflictos y decidir integración. D mantiene solo grupos locales. Se continúa sin aplicar cifras al catálogo y sin publicar antes de la revisión de Guille.
