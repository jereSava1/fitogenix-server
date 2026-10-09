# Estado actual y aplicación futura

Fecha: 2026-10-08. Este registro complementa el informe del proceso y actualiza la presentación propuesta de R-02.

Actualización de cierre: la entrega consolidada se guarda en la rama local `revision/entrega-correcciones-2026-10-08`, con fase A, R-01 y el borrador R-02. Ver [ENTREGA-PARA-JERE.md](ENTREGA-PARA-JERE.md), punto de entrada vigente. Los estados sin commit descritos a continuación corresponden a la preparación previa al cierre; el commit de entrega se identifica en el manifiesto externo del paquete. No se publicó ni desplegó automáticamente.

## Decisión de presentación vigente

Guille descartó el detalle opcional: mostrar solo la etiqueta breve. El prototipo local se ajustó para devolver solo `label`; conserva el texto original aparte en los ejemplos y no modifica los datos del motor. Las muestras anteriores que incluían recorrido son históricas, no la preferencia vigente.

La etiqueta se calcula a partir de `categories`/`category` del producto, eligiendo el último nivel de una ruta explícita. No es la marca, no es el nombre comercial ni es información contenida directamente en el código de barras. El código identifica un registro; los demás datos proceden de las fuentes asociadas.

Esto es una categoría propuesta, no una clasificación alimentaria nueva y verificada. `Sal` es un tipo claro; `Mesa Dulce Navideña` puede ser una sección de tienda. La selección del último nivel no basta para resolver esos casos. No inventar un tipo concreto y no dar por resuelta la semántica antes de revisar evidencia.

## Trabajo realizado y estado de Git

- Los nueve documentos originales de fase A se publicaron en `revision/fase-a-2026-10-08`, commit `ccc008881d12c7bf18962873292e61c336d0549b`.
- R-01 está implementada, probada y aprobada por Guille. Se conserva en el commit **local** `76bfd7f`, rama `revision/correccion-01-nutricion`. No tiene push ni despliegue.
- R-02 se prepara en `revision/correccion-02-categorias`, que parte de R-01. Incluye código para prevenir errores de acentos, pruebas, documentación y un prototipo local de presentación. Sus cambios siguen sin commit, sin push y sin conexión a la pantalla.
- No se modificó `main`, Supabase ni el motor del puntaje. No se dispone del repositorio de la app. No se han subido correcciones en paralelo a GitHub.

Se dejaron informes, guía para agentes, ejemplos reproducibles y estados de aprobación. La documentación facilita continuar el trabajo; no ejecuta ni aplica cambios por sí sola.

## Cómo se aplicará

1. Revisar y aprobar cada solución con Guille. Resolver las categorías comerciales ambiguas antes de tratarlas como tipo de alimento.
2. Conservar cada cambio aprobado en commits locales y preparar la entrega en una rama separada. Las ramas publicadas y locales no se intercambian ni se sobrescriben sin revisar sus diferencias.
3. Subir los cambios a GitHub cuando se autorice. Eso permite revisión de código; todavía no significa que estén desplegados.
4. Para R-01, publicar una versión del servidor aprobado permite que las respuestas lleven la conversión nutricional corregida. La app deberá comprobarse para confirmar que no vuelve a redondear mal esas cifras.
5. Para mostrar tipo de alimento, obtener acceso al código de la app y decidir el campo de respuesta del servidor. Hoy `ProductDetail` no expone una categoría. Preparar y probar de forma coordinada el dato del servidor y su visualización, sin modificar tablas.
6. Integrar y desplegar solo cuando corresponda la autorización. Un merge incorpora archivos; no crea automáticamente cambios que aún faltan en otro repositorio ni garantiza por sí solo el despliegue. La integración a main sigue prohibida hasta autorización expresa que cambie esa restricción.

La etiqueta breve permanece como prototipo de revisión. Aprobar su apariencia no aprueba todas las categorías del catálogo ni reemplaza la integración pendiente.
