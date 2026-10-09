# Contraste y orden de fases — 2026-10-08

Estado: contraste documental solicitado por Guille. No inicia otra fase ni aplica cambios. No se publicaron estos documentos.

## Plan operativo de esta conversación

El documento inicial aportado por Guille, `Texto pegado.txt`, define explícitamente:

| Fase | Alcance original | Estado actual |
|---|---|---|
| A | Validar el proceso sobre ocho productos de ejemplo | Cerrada como revisión documental del alcance disponible; hay evidencia y propuestas sin aplicar, con productos incompletos o en conflicto |
| B | Detector y limpieza de texto que no es ingrediente | No iniciada como implementación general; siguiente fase del plan operativo |
| C | Estándar nutricional: campos obligatorios y valores por 100 g/ml | No completada; existen investigación y preferencias, no un estándar plenamente implementado |
| D | Lotes de 50 productos con registro de cambios, y recién después escalar | No iniciada; no validar o corregir todo el catálogo de una vez |

Esta secuencia conserva los nombres del encargo original. Las reglas posteriores de Guille actualizan sus permisos: preparación local y autoaprobaciones registradas después de A; revisión humana antes de subir; Supabase solo lectura, sin tocar `main`. Consultar `REGISTRO-AUTOAPROBACIONES.md`. Pedir contrastar las fases no es una orden de ejecutar B.

## Plan estratégico del equipo

Fuente leída en GitHub: [docs/06-catalogo-confiable.md, rama docs/pm-testing-manual](https://github.com/jereSava1/fitogenix-server/blob/docs/pm-testing-manual/docs/06-catalogo-confiable.md), blob `da4045c014a0373baf79f4a4b4a6500c324f8a2b`.

Ese documento presenta dos recorridos distintos al encargo de esta conversación:

- Sección 6, fases 0–5: medir; cortar la IA que inventa; procedencia; verificación automática del catálogo; tabla de componentes, descripciones y presentación; recalibrar el motor.
- Sección 6b, etapas A–F: medir con cobertura de fotos en 500 códigos; 30–50 productos de control; piloto con controles y 200 productos adicionales; corte de la IA que inventa; lotes; publicar una base limpia.

No son fases realizadas por haber terminado nuestros ocho casos. Por ejemplo, nuestra fase A no equivale a medir fotos de 500 códigos, crear un conjunto de 30–50 controles o pasar un piloto de 200 productos. Tampoco están autorizadas las escrituras de base propuestas en ese plan.

La copia local de `06-catalogo-confiable.md` es anterior a esa revisión remota: no contiene el mismo detalle de sección 6b. No se sobrescribió; se identificó explícitamente la versión consultada.

## Corrección de la explicación anterior

La explicación del agente que llamó B a una auditoría general y C a todas las implementaciones no coincide con el plan operativo original. Fue una propuesta nueva, no una lectura fiel del plan; queda corregida por este documento.

Una medición de todos los registros puede servir para conocer cuántos problemas detecta B, en solo lectura. No sustituye a B, no confirma cada etiqueta y no permite pasar directamente a una limpieza o verificación masiva.

R-01 (sodio/colesterol) y el borrador R-02 son correcciones complementarias preparadas durante el trabajo posterior al análisis. No significan que se hayan completado B, C o D. Conservar sus pruebas y su estado, sin renombrar las fases para acomodarlas.

## Siguiente trabajo que corresponde a B

Preparar un detector que identifique leyendas, instrucciones de conservación, fragmentos de OCR, unidades sueltas y otros textos que no son ingredientes. Mostrar texto original, hallazgos y una limpieza propuesta en archivos locales, sin reemplazar el texto de la base.

Comprobarlo primero con los casos y evidencia disponibles. No eliminar automáticamente ingredientes ambiguos ni adivinar códigos INS mal leídos. Separar las leyendas de alérgenos de la lista sin perderlas. No conectar la limpieza al motor: modificar qué ingredientes recibe puede cambiar puntajes, y sigue vigente D-92.

Luego definir el estándar nutricional en C y probar lotes de 50 en D, registrando decisiones, conflictos y resultados. La escala completa viene después de esos controles, no inmediatamente después de los ocho ejemplos.

Los documentos del equipo también contienen diferencias de política entre consenso de dos fuentes y admisión de una etiqueta/marca, así como revisión automática y controles manuales. No se resuelven al renombrar fases ni se consideran automáticamente aprobadas. El permiso de autoaprobación técnica no verifica datos contradictorios.

## Actualización posterior: ejecución autorizada

Guille luego pidió iniciar y terminar el alcance autónomo B y avanzar C. El estado vigente está en CIERRE-B-Y-AVANCE-C.md: B técnico local cerrado; C implementado como diagnóstico aislado; D únicamente planificación de grupos. Las tablas anteriores describen el momento del contraste original. No equivale a aplicación o cobertura total del catálogo.
