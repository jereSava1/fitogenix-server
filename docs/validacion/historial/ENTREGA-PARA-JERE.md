# Entrega de correcciones y continuidad para Jere

Fecha: 2026-10-08. Rama de entrega: `revision/entrega-correcciones-2026-10-08`. Estado: entrega local preparada para revisión/publicación; sin despliegue. Esta guía es el punto de entrada al cierre del trabajo y prevalece como estado actualizado sobre descripciones históricas de preparación sin commit.

## Qué está implementado y qué falta

| Bloque | Entregado | Pendiente |
|---|---|---|
| Fase A | Los nueve archivos que ya se publicaron en `revision/fase-a-2026-10-08`, sin alterar su contenido | Usarlos como evidencia, no como datos ya aplicados a la base |
| R-01 nutrición | Código, 21 pruebas y dos referencias corregidas. Guille aprobó el resultado. Convertir gramos a mg antes de redondear | Publicar/desplegar el servidor aprobado y comprobar cómo lo muestra la app |
| R-02 acentos | Código preventivo y pruebas de categorías; no ejecuta escritura | Revisión final del resultado; no repara texto histórico |
| Tipo de alimento | Prototipo probado en `scripts/preview-product-categories.ts`. Guille eligió solo etiqueta breve, sin detalle | Resolver categorías comerciales ambiguas y conectar servidor/app. No está integrado al contrato HTTP |
| Otras soluciones del análisis | Investigación, recomendaciones y decisiones pendientes | No implementadas. No declarar resuelto todo el catálogo ni todos los problemas |

La rama reúne los archivos de evidencia y el código preparado. La corrección R-01 procede del commit local `76bfd7f`; los demás cambios se conservan como borrador para revisión en la rama de entrega. Estar en un commit o en GitHub no significa estar aprobado o desplegado.

## Restricciones del usuario

- Supabase solo lectura: no crear, modificar o borrar tablas, ejecutar migraciones, cargas o reparaciones. No correr `etl:*` por asumir que son diagnósticos.
- No modificar, integrar ni desplegar desde `main`. La publicación de la rama de revisión no revoca esta regla. Si se necesita cambiarla, pedir autorización explícita a Guille al final de la revisión concreta.
- No modificar `fitogenix-agents` ni cambiar el motor del puntaje en este bloque.
- No completar ingredientes/nutrientes de memoria. No compartir credenciales ni incluir `.env` en la entrega.
- Cada solución se revisa con Guille antes de continuar. Publicación, integración y despliegue requieren el alcance autorizado correspondiente.

## Pasos de implementación y comprobación

1. **Abrir esta rama y leer el contexto.** Revisar `GUIA-PARA-AGENTES.md`, `PROCESO-Y-DECISIONES-2026-10-08.md`, las revisiones R-01/R-02 y `INVESTIGACION-SOLUCIONES-2026-10-08.md`. Comparar con `etl-validacion` o con el commit base `53cbc6e9cf72113f983cdc195dff3030564d68e7`; no mezclar a main para revisar.
2. **Revisar el código que ya existe.** No reimplementar R-01 como si fuera solo una propuesta. `productData.ts` ya corrige precisión de sodio/colesterol. `extractCategory` evita corromper letras acentuadas, pero se usa al construir payloads, no en el detalle de la app. No ejecutar escrituras para demostrarlo.
3. **Conseguir acceso al repositorio de la app.** Este trabajo no pudo inspeccionar su código. El responsable con acceso debe revisar formato numérico, filas nutricionales y dónde se mostrará el tipo de alimento. No asumir que una corrección del servidor modifica todas las pantallas.
4. **Definir tipo de alimento sin perder clasificación.** Usar datos asociados al código de barras, no deducir el tipo desde sus dígitos. Marca, nombre y tipo son campos diferentes. `Sal` es claro; `Mesa Dulce Navideña` es una sección comercial y no verifica el tipo. No inventar una categoría precisa cuando falta evidencia. Preservar `raw.categories` para el puntaje.
5. **Integrar la etiqueta breve con el contrato y la pantalla.** Hoy `ProductDetail` no expone categoría. Proponer el campo, su comportamiento cuando falta y su compatibilidad con clientes existentes; probarlo en el servidor y en la app antes de adoptarlo. No mostrar recorrido opcional: Guille lo descartó. El script actual es una muestra local, no una ruta HTTP ya conectada.
6. **Verificar en un entorno de prueba autorizado.** Usar fixtures/simulaciones y valores de relleno. No usar el flujo real de escaneo sin revisar si registra historial o escribe cache/otras tablas: la restricción actual es Supabase solo lectura. Mostrar ejemplos antes/después a Guille; probar que el puntaje sigue igual y que la app no vuelve a redondear mal.
7. **Publicar e integrar con autorización.** Subir la rama permite revisión de código. Un merge solo incorpora archivos: no termina lo que falta en otro repositorio ni garantiza despliegue. Preparar el entorno de prueba y la reversión sin tocar main; pedir la autorización necesaria antes de cualquier integración o despliegue.
8. **Continuar las demás soluciones de a una.** Procedencia, unidades, selección de bloques, ingredientes y verificación siguen pendientes. Los archivos de evidencia pueden mantenerse separados sin escribir en la base. Los cambios de parsing/alias también pueden afectar puntajes: respetar D-92 y revisar cada impacto.

## Controles concretos

R-01 debe mostrar 46 mg desde 0,046 g; 362 mg desde 0,362 g; 664 mg desde 0,664 g; 2,2 mg de colesterol desde 0,0022 g. Tonadita conserva 200 mg por 100 g, equivalente a la referencia aprobada de 20 mg/10 g. Cero sigue cero y ausencia sigue ausencia.

Doritos: el usuario aportó 168 mg/25 g = 672 mg/100 g. La captura tiene 664 mg. R-01 corrige la presentación de esa captura; sustituir el dato por 672 es otra revisión y no se aplica en Supabase.

Categorías: `Lácteos` no debe convertirse en `LáCteos`; `Almacén > Sal` puede mostrarse como `Sal` sin reemplazar su clasificación interna. El prototipo no reconstruye palabras ya alteradas ni verifica semántica. Sacaan conserva búsqueda cerrada/datos incompletos; Raptor no se asocia a un sabor/EAN por parecido numérico.

## Pruebas y límites

Se comprobó el conjunto con 66 archivos y 1.077 pruebas, incluyendo motor y las propuestas de categorías; cobertura de líneas 98,70 % y ramas 95,67 %. Luego se eliminó el detalle opcional del prototipo y se volvieron a comprobar sus nueve pruebas y tipos. **En el cierre se repitió la suite completa: las 1.077 pruebas pasaron**, igual que tipos, dependencias, código no utilizado y contrato con normalización de lectura. Después solo se ajustó el salto de línea final de una prueba y la documentación de cierre; no cambió el comportamiento del código. La copia de fase A conserva un aviso previo de línea en blanco final en `capturar.mjs`, sin alterar esa evidencia.

Los chequeos de tipos, dependencias y código no utilizado pasaron. El contrato pasó normalizando CRLF/LF solamente en lectura; el comando estándar había fallado por saltos de línea de Windows. Las corridas finales de cobertura limitaron workers para evitar un timeout en una prueba de 200 productos; no se amplió el timeout ni se debilitó esa prueba. `.DS_Store` preexistente produce una advertencia del instrumento de cobertura. No se modificó ese archivo.

No se ejecutaron migraciones, tareas de carga, Docker ni auditoría de dependencias por red. Se bloqueó la red externa durante los chequeos y no se usaron credenciales reales. Los resultados de pruebas no equivalen a una comprobación de toda la base ni de una app desplegada.

## Papel de Guille

Revisar resultados y decidir alternativas; no tiene que programar ni volver a investigar todo. Recibir una comparación por solución, con lo aprobado, lo pendiente y la limitación real. Pedir confirmación sobre cambios concretos. No convertir su aprobación de una tabla de ejemplos en permiso para modificar Supabase o main.
