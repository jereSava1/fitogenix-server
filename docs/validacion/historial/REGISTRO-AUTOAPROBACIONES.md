# Registro de autoaprobaciones y alcance

## Autorización humana — 2026-10-08

Guille autorizó terminar la fase A y, después de ese cierre, aprobar automáticamente decisiones de trabajo. Exigió dejar anotado todo lo autoaprobado y no subir nada sin su revisión previa. Reiteró no tocar `main` ni las tablas de la base de datos.

La autorización permite preparar correcciones locales, elegir detalles de implementación y ejecutar comprobaciones locales dentro del alcance solicitado. No convierte decisiones técnicas en verificación de etiquetas, no permite inventar datos ni autoriza publicar, integrar, desplegar o escribir en Supabase. No se modificará `fitogenix-agents`.

## Decisiones de ejecución de este cierre

Estas acciones se realizaron para cumplir la orden explícita de cerrar fase A; no se atribuyen a un permiso posterior ni se presentan como aprobaciones de datos:

| ID | Acción | Motivo | Estado |
|---|---|---|---|
| C-A-01 | Añadir un cierre documental sin alterar las evidencias originales | Aclarar qué terminó y qué quedó sin verificar | Preparada localmente, pendiente de revisión humana |
| C-A-02 | Conservar los casos incompletos y las propuestas sin aplicar | Cerrar el análisis no exige inventar o seleccionar datos contradictorios | Documentado; ningún dato aprobado para escritura |
| C-A-03 | Repetir solo la auditoría de archivos locales y comprobar la integridad de la evidencia | Verificar que las barreras de fase A siguen cumpliéndose sin usar Supabase | Auditoría generada; nueve hashes coincidentes, dos avisos numéricos y cinco imágenes pendientes conservados |
| C-A-04 | No integrar categorías durante este cierre | Es implementación posterior, distinta del alcance documental de fase A | Pendiente para el siguiente bloque |
| C-A-05 | Contrastar las fases, a pedido explícito de Guille, y corregir la explicación anterior | El encargo original define B como limpieza de texto, C como estándar nutricional y D como lotes de 50; no coinciden con la numeración que propuso el agente | Documentación local actualizada; ninguna fase nueva ejecutada |

## Autoaprobaciones posteriores al cierre

Guille autorizó explícitamente iniciar B el 2026-10-08. Las siguientes son decisiones técnicas del agente, no aprobaciones humanas de datos:

| ID | Fecha | Decisión y motivo | Archivos y comprobación | Estado |
|---|---|---|---|---|
| B-01 | 2026-10-08 | Trabajar en `revision/fase-b-texto-ingredientes-2026-10-08`, preservando los cambios documentales locales del cierre | Estado de Git comprobado antes de crear rama; sin commit/push | Autoaprobada técnicamente; pendiente de revisión para publicación |
| B-02 | 2026-10-08 | Añadir detector aislado en `etl/validacion/`, sin conectar al ETL ni al motor; solo archivos y biblioteca estándar de Node | `detectar-texto-b.mjs`; 26 pruebas locales pasaron, al igual que tipos, dependencias y código no utilizado | Autoaprobada técnicamente; pendiente de revisión para publicación |
| B-03 | 2026-10-08 | Solo proponer separar rótulos y declaraciones explícitas; conservar alérgenos aparte, y señalar OCR, enriquecimiento y estructura ambigua sin adivinarlos | Doce entradas de los ocho casos: una separación candidata, cuatro con revisión necesaria, cuatro sin datos, tres sin hallazgos; 26 pruebas pasaron | Autoaprobada técnicamente; pendiente de revisión para publicación |
| B-04 | 2026-10-08 | No consultar nuevamente Supabase ni medir todo el catálogo en este bloque; usar la captura disponible con fecha y hash | Informe local de los ocho casos; no extrapolar métricas de la muestra al catálogo | Autoaprobada técnicamente; pendiente de revisión para publicación |
| B-05 | 2026-10-08 | Ejecutar pruebas de Node explícitamente y tres chequeos estáticos; no repetir suites de runtime o contrato sin cambios en esas partes | Pruebas B: 26/26; `typecheck`, `lint:deps`, `lint:unused`: salida 0; red externa bloqueada, sin claves reales | Autoaprobada técnicamente; comprobada; pendiente de revisión para publicación |
| B-06 | 2026-10-08 | Aclarar que la advertencia de leche se conserva y que su separación no se aplica; documentar arquitectura actual y futura integración sin crear una función que Guille indicó no poder autorizar | `DECLARACIONES-Y-FUENTES-FASE-B.md`; lectura de código, ADR-0011 y guías backend/arquitecto | Documentación autoaprobada técnicamente; función y publicación pendientes del equipo |
| B-07 | 2026-10-08 | Investigar Barcode Lookup en documentación oficial como fuente complementaria, sin cruce masivo, API paga o scraping; no equiparar coincidencia de código a verificación nutricional | Documentación API y términos leídos; ningún producto consultado a su API | Investigación autoaprobada técnicamente; piloto e integración pendientes |
| B-08 | 2026-10-08 | Ajustar el detector para no proponer retirar alérgenos, y distinguir cantidades explícitas entre paréntesis de unidades sueltas | Detector b-2 y 35 pruebas en verde; tipos y chequeos de dependencias pasaron; Tonadita y Monster conservados sin limpieza | Autoaprobada técnicamente y comprobada, a pedido de Guille; publicación pendiente |
| B-09 | 2026-10-08 | Por indicación de Guille, no usar la API; comprobar dos fichas públicas de códigos ya presentes en A con navegación normal, sin evadir controles ni recorrer el catálogo | Tonadita no encontrada en esa fuente; ficha de Doritos accesible, con nutrición textual y sal; registrar límites de base e independencia | Lectura acotada realizada; no equivale a validar nutrientes o autorizar escritura |
| B-10 | 2026-10-08 | Ampliar el piloto acotado a los códigos conocidos de A, siguiendo la orden de avanzar con el trabajo; guardar texto visible y resultados por código sin nuevas consultas a Supabase | Solo códigos explícitos de la captura; navegación pública normal, sin API, login o evasión; detenerse ante bloqueo | Realizada: 11 códigos, 7 fichas y 4 ausencias; 1 ficha conflictiva. Sin API ni consulta nueva a Supabase; publicación pendiente |
| B-11 | 2026-10-08 | Añadir comparación reproducible de archivos, campo por campo, que no confunda sal/sodio, base ausente, ficha ausente o identidad dudosa; reforzar validación del detector | Herramienta aislada y pruebas de límites; salidas locales nuevas | Comprobada: detector b-3 y comparador; 48 pruebas y tres chequeos estáticos pasaron. Nueve archivos A conservados; publicación pendiente |

Antes de ejecutar cada decisión posterior, añadir aquí su ID, fecha, problema, decisión, evidencia o motivo, archivos afectados, comprobación y estado de revisión/publicación. Actualizar el resultado después de comprobarla.

## Continuación autorizada por Guille

## Auditoría y continuación solicitadas posteriormente

## Recorrido global de solo lectura

**CORRECCIÓN VIGENTE:** Guille aclaró que no existe permiso del dueño para el barrido; la declaración anterior fue un malentendido. Toda mención anterior de autorización de la fuente queda conservada como antecedente rectificado y no autoriza continuar scraping. Ningún proceso de barrido está activo. Las 25 respuestas y el 403 permanecen como hechos observados, sin aplicación.

| ID | Fecha | Acción y criterio | Estado |
|---|---|---|---|
| BARCODE-GLOBAL-07 | 2026-10-08 | Rectificar permiso en estado, guía, resumen y entrega; marcar el relato previo como histórico, sin borrar observaciones | Sin permiso de scraping; detener consultas automatizadas de páginas |
| API-EVALUACION-01 | 2026-10-08 | Consultar documentación/precios oficiales y evaluar conveniencia con la evidencia local; recomendar prueba antes de compra | Propuesta de API, sin registro de cuenta, contratación, llamadas API o publicación |

Entrega completa solicitada por Guille: reunir todo lo trabajado hoy que no se haya publicado, explicar estado y pendientes, sin subir nada. Se verificó que la rama remota de correcciones ya apunta al HEAD local f41aa1a; no se incluye esa corrección como novedad pendiente. Se consolida el delta B/C y se conservan resultados e historia aparte.

| ID | Fecha | Acción y criterio | Estado |
|---|---|---|---|
| ENTREGA-COMPLETA-01 | 2026-10-08 | Leer referencias remotas y usar f41aa1a como base de lo ya subido | Comprobada mediante ls-remote; sin mutación del remoto o main |
| ENTREGA-COMPLETA-02 | 2026-10-08 | Añadir estado consolidado y actualizar guía; reunir archivos nuevos/modificados, pruebas y respaldos privados separados | Preparación local autoaprobada; publicación pendiente de revisión de Guille |
| ENTREGA-COMPLETA-03 | 2026-10-08 | Conservar herramientas auxiliares/captura privada e historia, excluyendo credenciales, runtimes, dependencias, caches y metadatos Git | Integridad y revisión de secretos a registrar en manifiesto de entrega; no equivale a aprobación de aplicación o despliegue |

Actualización posterior de Guille: «estamos completamente autorizados a hacer el barrido completo, ya tenemos el permiso del dueño de la pagina». Se acepta esa autorización para continuar; deja sin efecto el pendiente anterior de permiso de la fuente. No se exige otra confirmación por tanda. No implica aprobación de escritura, main o publicación. No se recibió un documento del dueño; se registra la declaración del usuario sin inventar evidencia adicional.

| ID | Fecha | Acción y criterio | Estado |
|---|---|---|---|
| BARCODE-GLOBAL-04 | 2026-10-08 | Retomar diez códigos pendientes mediante el navegador, con parada ante verificación o respuesta desconocida | Completada: nueve sin ficha y arroz Vanguardia con ingrediente visible; 25 consultas resueltas acumuladas |
| BARCODE-GLOBAL-05 | 2026-10-08 | Comprobar acceso directo para ejecución por tandas; una solicitud GET sin credenciales, con agente identificado y sin redirecciones automáticas | HTTP 403, página Barcode Lookup Security Verification; parada, sin resolver CAPTCHA ni probar evasiones |
| BARCODE-GLOBAL-06 | 2026-10-08 | Guardar el 403 como intento pendiente y actualizar cobertura y tandas sin sobrescribir entregas anteriores | 81.444 filas conservadas; 25 resueltas y 81.419 pendientes; autorización de uso recibida, habilitación técnica pendiente |

Continuación solicitada: consultar cada código en Barcode Lookup por tandas, sin aprobación por tanda, sin main ni escritura en Supabase. Cuatro consultas individuales nuevas completadas; junto con las 11 anteriores hay 15 códigos consultados. No se ejecutó un recolector masivo: sección 5 de las condiciones de la fuente excluye extracción automatizada fuera de la API. No hubo CAPTCHA ni bloqueo técnico en estas consultas. No se solicita una nueva aprobación genérica a Guille; falta una vía de acceso admitida por la fuente.

| ID | Fecha | Acción y criterio | Estado |
|---|---|---|---|
| BARCODE-GLOBAL-01 | 2026-10-08 | Abrir cuatro códigos exactos de la captura en páginas públicas y registrar el resultado sin corregir originales | Tres sin ficha y un vino con ficha, sin nutrición visible; consulta limitada completada |
| BARCODE-GLOBAL-02 | 2026-10-08 | Preparar cobertura individual de 81.444 códigos y distribuir 81.429 pendientes en tandas de hasta 50 | Comprobada: 1.629 tandas, última de 29; preparadas, no ejecutadas |
| BARCODE-GLOBAL-03 | 2026-10-08 | Documentar restricción real de uso y conservar un borrador de consulta al sitio | Sin contratación, envío de mensaje, API o publicación; barrido externo completo pendiente |

Guille preguntó por el recorrido de todos los códigos después de haber autorizado continuar el trabajo con Supabase solo lectura. Se comprobó acceso mediante GET a products: 81.444 filas. Se inició captura local paginada por UUID y límite superior inicial. No se usa la API de la app ni jobs de escritura. La captura no es una transacción/snapshot atómico; registrar tiempos y comparación de conteo.

| ID | Fecha | Acción y criterio | Estado |
|---|---|---|---|
| LECTURA-GLOBAL-01 | 2026-10-08 | GET paginado de products, credencial solo en memoria y páginas privadas locales; ninguna solicitud de escritura | Completada: 81.444 filas en 82 páginas, conteo inicial coincidente; no es snapshot atómico; no publicación |
| AUDITORIA-GLOBAL-01 | 2026-10-08 | Medir todos los códigos capturados y ejecutar detector B/diagnóstico C localmente; señalar datos malformados sin omitir la fila o inventar códigos | Completada: hashes e IDs comprobados, 81.444 filas procesadas, tres pruebas GTIN aprobadas; no verificación externa completa |
| COLA-GLOBAL-01 | 2026-10-08 | Preparar 50 candidatos por faltantes; exigir comprobar alcance alimentario antes de consultar fuentes: aparecen artículos de higiene y nombres desconocidos | Borrador pendiente de clasificación y consulta; no representa 50 alimentos validados ni autorización de actualización |

| ID | Fecha | Decisión | Comprobación | Estado |
|---|---|---|---|---|
| C-05 | 2026-10-08 | Preparar puente local de panel explícito al formato legacy por 100 g, devolviendo sodio/colesterol a gramos de almacenamiento; bloquear ml para ese puente | Probar con extractNutrition y toProductDetail reales en memoria, sin API o clientes de escritura | Comprobada: 90 pruebas herramientas + 6 backend; cinco chequeos en verde |
| C-06 | 2026-10-08 | Mostrar antes/después simulado de Tonadita y referencia Doritos, conservando todos los demás campos | Captura A y normalización explícita; no aplicar ni reinterpretar etiqueta Doritos | Comprobada: preview real Tonadita 200→200 y Doritos 664→672; simulación sin aplicar |

| ID | Fecha | Decisión | Evidencia y comprobación | Estado |
|---|---|---|---|---|
| B-14 | 2026-10-08 | Limitar la atribución de aceptación humana a los 15 números de la muestra revisada | Un caso nuevo sintético era atribuido a Guille por error; prueba de regresión y lista explícita de campo/código/valor | Comprobada: caso nuevo ya no atribuido a Guille; 15 aceptaciones originales conservadas; 82 pruebas |
| C-03 | 2026-10-08 | Implementar conversión de paneles con porción y unidades explícitas, sin inferir densidad o fuente | Ejemplos documentados Tonadita y referencia Doritos; mantener candidatos y discrepancia fuera de tablas | Comprobada con 82 pruebas, tipos y chequeos estáticos; sin publicación |
| C-04 | 2026-10-08 | Añadir diagnóstico de códigos duplicados al auditor local | IDs por posición no detectaban duplicación de EAN; conservar ambas filas y señalar ambigüedad | Comprobada con regresión de EAN repetido y 82 pruebas anteriores |

Nueva orden: terminar el alcance autónomo de B, avanzar C y apartar pasos que requieran ayuda, con entrega conjunta posterior. No se considera autorización de publicación o escritura.

| ID | Fecha | Decisión | Motivo y comprobación | Estado |
|---|---|---|---|---|
| B-13 | 2026-10-08 | Ejecutar detector sobre los 200 registros del fixture existente, con identidad local por posición y hash, sin inventar EAN | Amplía pruebas sobre datos del repo; no representa catálogo vigente ni control de etiquetas | Comprobada: 200 originales y offsets conservados, cuatro grupos de 50; publicación pendiente |
| C-02 | 2026-10-08 | Añadir diagnóstico de rangos, relaciones y unidades a la auditoría offline; mostrar alertas sin reparar cifras | Basado en rangos existentes de etl/quality/nutrientPlausibility.ts y comprobaciones numéricas conservadoras; no cambia servidor | Comprobada: 72 pruebas y tres chequeos estáticos; publicación pendiente |
| BC-ENTREGA | 2026-10-08 | Consolidar una entrega nueva, dejando los puntos humanos apartados y las versiones anteriores intactas | Informe de cierre técnico B, avance C, lista de pasos saltados y manifiesto | Autoaprobada técnicamente; revisión antes de publicación |

Guille indicó aceptar las coincidencias numéricas como validación del dato; apartar candidatos faltantes y ficha conflictiva para conversar después; continuar autónomamente sin tocar main ni tablas. Se registra aceptación del valor numérico, sin afirmar que una base no documentada o fórmula pendiente quedó comprobada. La publicación continúa pendiente de revisión humana.

| ID | Fecha | Decisión y motivo | Comprobación | Estado |
|---|---|---|---|---|
| B-12 | 2026-10-08 | Registrar las coincidencias aceptadas por Guille con alcance numérico y separar faltantes/conflictos en una lista de decisiones pendientes, sin sustituir originales | Nuevo informe offline reproducible y pruebas | Comprobada: 61 pruebas y tres chequeos estáticos; pendiente de publicación |
| C-01 | 2026-10-08 | Preparar estándar nutricional y auditoría local de formato: unidades explícitas de claves existentes, cero distinto de ausencia, sin derivar sodio de sal o copiar valores web | Prototipo aislado fuera del servidor y pruebas | Comprobada: 61 pruebas y tres chequeos estáticos; no integración ni publicación |
| D-PREP-01 | 2026-10-08 | Preparar distribución local en grupos de hasta 50, preservando identidades agrupadas; no ejecutar actualización de productos | Archivos locales nuevos y límites de lote comprobados | Comprobada con 101 registros (50/50/1); fase D de aplicación no iniciada |

Un resultado puede estar `autoaprobado técnicamente` y al mismo tiempo `pendiente de revisión humana para publicación`. No llamarlo `aprobado por Guille` si fue una decisión del agente. Las aprobaciones previas de Guille, como R-01, conservan su autoría y alcance original.
