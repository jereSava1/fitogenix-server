# Guía para continuar la validación de Fitogenix

## Punto de entrada vigente de la entrega completa

Leer primero `ESTADO-CONSOLIDADO-2026-10-08.md` y `BARCODE-PERMISO-CORREGIDO-Y-API-2026-10-08.md`. Guille aclaró que NO existe permiso del dueño para scraping: la afirmación previa fue un malentendido. Detener barrido de páginas; evaluar API mediante prueba acotada, sin compra automática. Los documentos de la tanda anterior conservan historia rectificada, no autorización vigente. La rama remota de correcciones está en f41aa1a. B/C posteriores siguen locales, con 96 pruebas y tres GTIN adicionales. Captura/diagnóstico de 81.444 filas completos; Barcode tiene 25 códigos con respuesta y 81.419 pendientes. No corre un proceso en segundo plano. Supabase solo lectura, main intacto, revisión antes de publicar y respaldos privados fuera de Git.

Esta guía registra instrucciones de Guille y el acuerdo de revisión manual del 2026-10-08. Leer también `PROCESO-Y-DECISIONES-2026-10-08.md` y la revisión de la corrección activa. No confundir un informe con una autorización para ejecutar sus propuestas.

Actualización posterior de Guille, 2026-10-08: cerrar fase A y luego avanzar con autoaprobaciones locales registradas, sin subir nada antes de su revisión. Leer [CIERRE-FASE-A.md](../CIERRE-FASE-A.md) y [REGISTRO-AUTOAPROBACIONES.md](REGISTRO-AUTOAPROBACIONES.md). Esta instrucción actualiza el requisito histórico de pedir aprobación para cada detalle local: se puede preparar y probar dentro del alcance autorizado, registrando cada autoaprobación. La revisión humana previa a publicación, la prohibición de tocar `main` y Supabase solo lectura siguen vigentes. No autoaprobar identidad, cifras contradictorias ni cambios de criterio nutricional sin evidencia o la decisión de producto correspondiente.

Orden de fases contrastado con el encargo original: A, ocho casos; B, detector y limpieza de texto que no es ingrediente; C, estándar nutricional; D, lotes de 50 antes de escalar. Leer [CONTRASTE-Y-ORDEN-DE-FASES.md](CONTRASTE-Y-ORDEN-DE-FASES.md). No llamar B a una auditoría general ni confundir este recorrido con las fases 0–5 o etapas A–F del plan estratégico del equipo. Las correcciones R-01/R-02 son complementarias; no completan B/C/D.

Guille autorizó iniciar B: primera entrega local en `revision/fase-b-texto-ingredientes-2026-10-08`, documentada en [FASE-B-RESULTADO.md](FASE-B-RESULTADO.md). Detector aislado en `etl/validacion/detectar-texto-b.mjs`, sin integración con runtime, motor o escrituras. Sus pruebas usan `node:test`, no Vitest. Mantener texto original y alérgenos; no interpretar `sin_hallazgos_del_detector` como verificación. No publicar sin revisión humana ni usar el bundle anterior como si incluyera B.

Actualización posterior: Guille quiere conservar `CONTIENE DERIVADOS DE LECHE` y declaró que no puede autorizar una función nueva de advertencias. Conservar el funcionamiento actual; la separación candidata no se aplica. Leer [DECLARACIONES-Y-FUENTES-FASE-B.md](DECLARACIONES-Y-FUENTES-FASE-B.md). No crear campos HTTP, pantallas o una integración paga por esta propuesta. Barcode Lookup sería evidencia complementaria: falta de ficha no invalida un código, y código coincidente no verifica toda la nutrición. La propuesta inicial de usar API quedó descartada por la instrucción siguiente; siempre mantener revisión antes de publicación.

Actualización más reciente: Guille descartó usar la API y pidió lectura web solo de códigos del catálogo. El detector b-2 conserva alérgenos también en candidatos y distingue cantidades explícitas de unidades sueltas. Leer [FASE-B-MEJORAS-Y-PILOTO-WEB.md](FASE-B-MEJORAS-Y-PILOTO-WEB.md). Se comprobaron dos páginas públicas con navegador normal; no se consultó el catálogo completo ni se creó un scraper masivo. No usar API, contratar servicios o eludir bloqueos; límites y condiciones del acceso masivo siguen sin resolver. No convertir sal en sodio ni asumir una base nutricional ausente de la ficha.

Punto de entrada del cierre: [ENTREGA-PARA-JERE.md](ENTREGA-PARA-JERE.md), rama local `revision/entrega-correcciones-2026-10-08`. Incluye los nueve archivos de fase A y las implementaciones preparadas. R-01 está aprobada; R-02 mantiene integración y semántica pendientes. La etiqueta es breve, sin detalle opcional. El commit y la publicación se identifican en el manifiesto de entrega; no suponer que lo local está en GitHub.

## Límites persistentes

1. Supabase solo lectura. No escribir ni siquiera tablas nuevas. No ejecutar migraciones, cargas, enriquecimientos, reparaciones, upserts ni SQL/RPC que puedan modificar datos. Los procesos ETL existentes no quedan autorizados por usarlos como referencia.
2. No modificar ni integrar a `main`; comprobar la rama y el estado de Git antes de editar. No modificar `fitogenix-agents`.
3. Preparar correcciones locales dentro del alcance autorizado, de a una, y registrar cada autoaprobación técnica. Mostrar antes/después y resultados al usuario. No atribuirle al usuario una aprobación del agente; no publicar nada antes de su revisión.
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
6. Entregar comparación antes/después y archivos revisables a Guille. Marcar `pendiente de revisión humana para publicación` aunque las pruebas pasen; distinguir autoaprobación técnica y aprobación humana.
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

## Continuación vigente: piloto b-3

Leer `FASE-B-AMPLIACION-Y-REVISION.md` y el README B antes de retomar. Detector b-3 y comparador offline: 48 pruebas pasaron; 11 códigos, 7 fichas, 4 ausencias y 1 conflicto de identidad (Rhodesia/LEGO). Sin API ni acceso nuevo a Supabase. 14 candidatos faltantes, ninguno habilitado para aplicar por base e identidad pendientes. Informes b-1/b-2 son historia. No publicar sin revisión de Guille, no escribir tablas ni tocar main. El JSON de comparación no es un payload de actualización.

## Continuación B/C vigente

Leer CONTINUACION-BC-RESULTADO.md, DECISIONES-PENDIENTES-BC.md y ESTANDAR-NUTRICIONAL-C-PROPUESTO.md. Guille acepta 15 coincidencias como validación numérica; no equivale a confirmar base/fórmula ni escribir. Faltantes y ficha conflictiva apartados para discutir. Prototipo C aislado y grupos locales de hasta 50; 61 pruebas. No integrar/publicar sin revisión; no tocar main o tablas.

## Estado vigente: cierre B y avance C

Leer CIERRE-B-Y-AVANCE-C.md primero. B cerrado técnicamente como detector/comparador local, sin limpieza del catálogo ni integración. C diagnóstico offline funcionando; 72 pruebas. Muestra de 200 fixture con hash, 26 textos pendientes y 15 filas con alertas; no catálogo actual. Candidatos y ficha conflictiva apartados por Guille. D solo grupos locales. No tocar main/tablas ni publicar sin revisión.

## Auditoría vigente y avance C

Leer AUDITORIA-Y-AVANCE-C.md primero. Corregida atribución de aprobación: solo 15 triples código/campo/valor, nuevas coincidencias pendientes. Auditor señala códigos repetidos. Normalizador C solo con porción/unidades explícitas, sin aplicar cifras: Tonadita 200 mg/100 g; referencia Doritos 672 pendiente frente a captura 664. 82 pruebas. Versiones anteriores son historia; no tocar main/tablas ni publicar sin revisión.

## Estado vigente: puente C probado en backend real

Leer PUENTE-C-Y-BACKEND-REAL.md. 90 pruebas herramientas y 6 pruebas reales locales de catalog. Nuevo src contiene únicamente un test, no cambios productivos. ETL no importa internos del servidor: test dentro de catalog consume fixture JSON. Puente g compatible; ml bloqueado por base/contrato. Preview Tonadita 200→200 mg; Doritos 664→672 solo referencia pendiente. No tocar main/tablas ni publicar antes de revisión.
