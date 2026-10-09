# Fase B — primera entrega para revisión

Fecha: 2026-10-08. Rama local: `revision/fase-b-texto-ingredientes-2026-10-08`. Estado: detector y propuestas preparados y probados con la muestra disponible. Pendiente de revisión humana antes de publicar. No se hizo commit, push, PR, merge o despliegue en este bloque.

## Qué se hizo

Se añadió un detector aislado y ejecutable de texto que no es ingrediente. Se usa sobre JSON local: guarda cada texto original, las posiciones de sus hallazgos, el motivo y una limpieza candidata cuando la separación es clara. No conecta al servidor, al motor o a los jobs que escriben en Supabase.

La fase A reunía ocho casos, representados por doce entradas debido a presentaciones distintas y productos sin identidad confirmada. Se revisaron esas doce entradas usando los originales conservados en `propuestas-finales-a.json`, de la captura del 08/10/2026. No se consultó de nuevo la base ni se verificó todo el catálogo.

## Resultado de la muestra

| Entrada | Resultado | Qué se propone |
|---|---|---|
| Ilolay 120 g | Rótulo, declaraciones sin gluten, OCR, saltos de línea y paréntesis incompletos | Conservar original; no reconstruir receta |
| Ilolay, otra presentación | Sin ingredientes en la entrada disponible | Mantener ausencia |
| Ilolay 40 g | Sin hallazgos de estas reglas | Conservar original; no equivale a validación completa |
| Ilolay Carrefour | Sin ingredientes | Mantener ausencia |
| Sacaan | Publicidad de colesterol, párrafo de enriquecimiento, unidades, OCR, saltos de línea e INS repetido | Conservar original y señalar cada fragmento; no corregir códigos dudosos |
| Bariloche 135 g | Sin hallazgos de estas reglas | Conservar original; no prueba corrección del parser ni vigencia |
| Bariloche 80 g | Abreviaturas `art.` que el parser puede partir | Señalar; no dividir ni adivinar ingredientes |
| Doritos | Sin ingredientes | Mantener ausencia |
| Rhodesia | Sin hallazgos de estas reglas | Conservar original; sigue pendiente el problema estructural de parsing/alias de aditivos |
| Monster | Cantidad/unidad dentro de la lista | Señalar para revisión, conservar sucralosa y todos los ingredientes; una cantidad no es por sí sola basura |
| Tonadita | Declaración de alérgenos pegada a los ingredientes | Separación candidata, con declaración preservada |
| Protein PM-24 | Sin ingredientes e identidad incompleta | Mantener ausencia; no copiar receta de un sabor conocido |

Conteos: una propuesta de separación, cuatro entradas con señales para revisión, cuatro sin datos y tres sin hallazgos de estas reglas. Son resultados de una muestra, no porcentajes del catálogo ni números de productos verificados.

## Comparación concreta: Tonadita

Antes, texto conservado de la captura:

```text
Crema de leche pasteurizada, sal CONTIENE DERIVADOS DE LECHE.
```

Lista de ingredientes propuesta:

```text
Crema de leche pasteurizada, sal
```

Declaración conservada por separado, sin descartarla:

```text
CONTIENE DERIVADOS DE LECHE.
```

Es una propuesta para archivo local; la fila en Supabase y la app siguen igual. El detector no añade un punto final ni cambia la receta. La coincidencia con la evidencia de A no lo convierte en autorización para escribir ni para cambiar el puntaje.

Actualización de Guille: conservar la advertencia de leche; no autoriza una función nueva para mostrar advertencias. No adoptar esta limpieza como reemplazo del texto actual. La separación queda como opción pendiente del equipo, conservando original y declaración. Leer [DECLARACIONES-Y-FUENTES-FASE-B.md](DECLARACIONES-Y-FUENTES-FASE-B.md) para la arquitectura comprobada y la propuesta de fuente complementaria.

## Qué se autoaprobó

Trabajar en rama separada, usar un script aislado sin dependencias nuevas, conservar texto y declaraciones, bloquear limpiezas parciales ambiguas y usar datos locales existentes. Son decisiones técnicas registradas en `REGISTRO-AUTOAPROBACIONES.md`; no aprobaciones de Guille sobre nuevos datos.

## Comprobaciones y límites

Las 26 pruebas de Node pasaron. Incluyen ejemplos donde no se deben borrar ingredientes, alérgenos dentro de componentes, unidades válidas, OCR, paréntesis, ausencia, posiciones, conservación del input y rechazo de sobrescritura. Pasaron `typecheck`, `lint:deps` y `lint:unused`. La red externa estuvo bloqueada y no se usaron credenciales reales.

No se repitieron Vitest, cobertura o contrato: no hubo cambios en `src/`, endpoints, contratos o dependencias. Las pruebas nuevas son de `node:test` y deben ejecutarse explícitamente con el comando del README; no se presentan como parte de las 1.077 pruebas anteriores. No se ejecutaron migraciones, Docker, ETL de carga o auditoría en red.

El detector no soluciona el parser general, no clasifica todos los ingredientes, no valida INS, no deduplica equivalencias nombre/código ni comprueba fórmulas de envases. No tener hallazgos no es estar verificado. Declaraciones alimentarias, fortificación y conservación ambiguas quedan señaladas, no eliminadas. Los saltos de línea no se unen automáticamente. Unidades dentro de ingredientes pueden ser legítimas.

## Qué revisar y cómo continuar

Guille revisa la separación propuesta en Tonadita y si prefiere mantener siempre bloqueados los casos dudosos, como en esta entrega. No necesita programar o transcribir todo nuevamente.

La siguiente ampliación de B es añadir ejemplos de otros tipos de textos y medir falsos positivos/negativos con evidencia. Una auditoría general de solo lectura puede medir la frecuencia del detector después, pero no permite limpiar toda la base o dar por ciertas sus propuestas. C define el estándar nutricional; D trabaja lotes de 50 antes de escalar. Mantener D-92: no conectar esta limpieza al puntaje hasta que corresponda una revisión separada.

Ejecución y formato de entrada: `etl/validacion/README-FASE-B.md`. La salida `PROPUESTAS-TEXTO-B.json` conserva `applied=false`, `verified=false` y el hash del archivo de entrada. La entrega anterior y su bundle no incluyen esta fase B: no usar instrucciones de subida antiguas para publicar sin revisión.
