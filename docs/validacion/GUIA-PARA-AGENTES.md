# Guía para continuar la validación de Fitogenix

Esta guía registra instrucciones de Guille y el acuerdo de revisión manual del 2026-10-08. Leer también `PROCESO-Y-DECISIONES-2026-10-08.md` y la revisión de la corrección activa. No confundir un informe con una autorización para ejecutar sus propuestas.

Punto de entrada del cierre: [ENTREGA-PARA-JERE.md](ENTREGA-PARA-JERE.md), rama local `revision/entrega-correcciones-2026-10-08`. Incluye los nueve archivos de fase A y las implementaciones preparadas. R-01 está aprobada; R-02 mantiene integración y semántica pendientes. La etiqueta es breve, sin detalle opcional. El commit y la publicación se identifican en el manifiesto de entrega; no suponer que lo local está en GitHub.

## Límites persistentes

1. Supabase solo lectura. No escribir ni siquiera tablas nuevas. No ejecutar migraciones, cargas, enriquecimientos, reparaciones, upserts ni SQL/RPC que puedan modificar datos. Los procesos ETL existentes no quedan autorizados por usarlos como referencia.
2. No modificar ni integrar a `main`; comprobar la rama y el estado de Git antes de editar. No modificar `fitogenix-agents`.
3. Una corrección por revisión. Preparar y probar localmente el cambio autorizado; mostrarlo al usuario; esperar su revisión antes de darlo por aprobado o avanzar al siguiente bloque.
4. No publicar ni desplegar sin autorización aplicable. La subida anterior de nueve archivos no autoriza futuras subidas.
5. No copiar credenciales a código, documentos, ejemplos, logs o commits. Para pruebas usar datos de relleno y bloquear conexiones externas.

## Cómo trabajar con Guille

Guille no programa. Investigar y preparar alternativas es tarea del agente. Su rol es decidir el comportamiento y revisar resultados concretos. Explicar en español simple qué cambió, por qué, cómo se comprobó y qué queda pendiente. Mostrar ejemplos antes/después y pedir una decisión específica, sin enviar al usuario a investigar problemas que el agente puede resolver.

La confirmación es por resultado y alcance. Una opinión favorable general no significa aprobar todos los cambios, todos los productos o un despliegue. Si ya existe autorización clara para preparar una solución, hacerla concreta antes de pedir otra decisión; no repetir permisos innecesarios. El silencio no aprueba.

## Ciclo de cada corrección

1. Leer el estado actual, confirmar rama/base y conservar cambios ajenos.
2. Identificar un problema reproducible y separar dato incorrecto, dato ausente, identidad, parser, presentación y criterio de puntaje.
3. Registrar alcance, alternativas y ejemplos. Reutilizar evidencia previa sin tratarla como una captura reciente.
4. Preparar solo ese cambio y pruebas adecuadas. Evitar migraciones, accesos reales a servicios y cambios incidentales.
5. Registrar comandos, resultados y limitaciones; distinguir fallos del código de problemas del entorno. No actualizar snapshots en bloque para ocultar diferencias: revisar cada diferencia esperada.
6. Entregar comparación antes/después y archivos revisables a Guille. Marcar `pendiente de revisión humana` aunque las pruebas pasen.
7. Si el usuario pide una alternativa, compararla sin sobrescribir la evidencia original. Registrar su decisión y motivo.
8. Publicar solo cuando esté autorizado, siempre en rama separada; la integración o despliegue tiene su propia decisión.

## Reglas de evidencia

- Conservar valor/texto original, fuente, URL, fecha de captura, identidad, unidad y base. Fecha de captura no es fecha de vigencia del envase.
- Separar `sin dato`, `cero declarado`, `cantidad no significativa`, `menor que`, `ilegible` y `en conflicto`. No reemplazar automáticamente estos estados por cero.
- No deducir carbohidratos ausentes desde calorías ni inventar ingredientes desde el nombre.
- No asociar datos entre sabores, tamaños, mercados o códigos sin evidencia. No transformar ml en g sin densidad documentada.
- Una foto con dos lectores sigue siendo una fuente. Fuentes que copian el mismo dato no son independientes.
- `ai_enriched=false`, coherencia numérica o apariencia correcta no prueban verificación.
- Conservar en los casos de control la referencia de Tonadita de 20 mg/10 g, Sacaan incompleto con búsqueda cerrada, y Raptor sin asociación confirmada al EAN candidato.
- Los criterios de consenso del plan requieren unificación. No decidir esa política silenciosamente ni usar ±20 % como aprobación automática entre páginas.

## Puntaje y pantalla

Preferencia posterior de Guille para R-02: mostrar solo la etiqueta breve de categoría, sin detalle opcional ni recorrido. La categoría no es la marca ni se obtiene de los dígitos del código de barras: procede de los datos asociados al producto. El prototipo selecciona el último nivel de una jerarquía explícita, pero eso no verifica que sea un tipo de alimento preciso. `Mesa Dulce Navideña` puede ser una sección comercial. No inventar un tipo más específico ni presentar esa clasificación como validada; revisar la semántica antes de integrar la pantalla. La clasificación original debe conservarse para el motor.

D-92 mantiene los cambios del puntaje pendientes hasta tener evidencia suficiente. La regla de cobertura propuesta y las reglas del motor actual no son idénticas. Cambiar parsing, deduplicación o alias puede cambiar puntajes aunque no se cambie la fórmula: demostrar y revisar ese impacto antes de introducirlo en el motor.

D-94 sigue pendiente. Las fallas de filas nutricionales de la app están documentadas, pero no verificadas directamente en su código porque no se dispone del enlace al repositorio. No afirmar que se corrigió la app por haber corregido el servidor.

R-01 corrige únicamente conversión/redondeo y validación numérica para presentación. Conserva el fallback actual de nutrientes sin sufijo; no resuelve su base de medida ni verifica productos completos.

## Estados que debe registrar el agente

Usar `propuesto`, `preparado`, `pendiente de revisión humana`, `aprobado por el usuario`, `requiere alternativa` o `publicado`. Conservar la fecha y el alcance de cada aprobación. No marcar una solución como aplicada en producción por tener un diff local o un commit.

Al terminar, dejar el siguiente paso, la corrección activa, la rama, los archivos cambiados, las pruebas y lo que necesita decisión humana. Esta guía vive en documentación, no es un mecanismo automático que garantice que otro agente la lea: enlazarla expresamente al delegar o retomar el trabajo.
