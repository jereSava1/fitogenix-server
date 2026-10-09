# Fase B: detector b-2 y lectura pública de dos códigos

Fecha: 2026-10-08. Rama `revision/fase-b-texto-ingredientes-2026-10-08`. Entrega local pendiente de revisión antes de publicar. Esta revisión prevalece sobre la primera entrega b-1 para describir el comportamiento actual. Los archivos de b-1 ya entregados se conservan como registro histórico.

## Cambios pedidos por Guille

El detector ya no propone retirar declaraciones de alérgenos, incluso cuando el texto es claro. Registra la declaración en el informe y la conserva dentro del original y de cualquier propuesta que quite solamente el rótulo `Ingredientes:`. No se crea un apartado visual ni se modifica el contrato del servidor.

Las cantidades numéricas explícitas entre paréntesis, junto a un ingrediente y con estructura cerrada, se señalan como información conservada. Ejemplo: `sucralosa (5mg/100g)`. Las unidades sueltas, paréntesis incompletos o frases ambiguas siguen pendientes de revisión. Reconocer la forma de una cantidad no verifica su valor ni su unidad de referencia.

Una frase `Contiene ...` que no coincide con los alérgenos explícitos reconocidos se guarda como declaración por clasificar, no se convierte automáticamente en alergeno. `Contiene fenilalanina` se conserva sin asignarle una interpretación sanitaria o clasificarlo como ingrediente nuevo.

## Resultado actual sobre la misma captura de A

| Caso | Resultado b-1 | Resultado b-2 |
|---|---|---|
| Tonadita | Candidato sin advertencia, preservada aparte | No propone quitarla; el texto completo queda conservado |
| Monster | Revisión por cantidad en ingredientes | Cantidad explícita conservada, sin propuesta de limpieza |
| Ilolay 120 g, Sacaan, Bariloche 80 g | Revisión necesaria | Revisión necesaria; no reconstruye recetas, une líneas o adivina códigos |
| Entradas sin ingredientes | Ausencia | Ausencia |

Doce entradas de los ocho casos: tres con revisión necesaria, cuatro sin datos, tres sin hallazgos de estas reglas y dos con información conservada sin limpieza. No se generó una limpieza candidata en esta muestra b-2. La ausencia de candidato no significa que la receta sea correcta ni que la fase haya validado todo el catálogo.

Las 35 pruebas del detector pasaron. Pasaron también `typecheck`, `lint:deps` y `lint:unused`. Las pruebas fueron locales con red externa bloqueada y sin claves reales. No se repitió la suite de runtime: no cambió `src/`, el puntaje, el contrato o las dependencias. Originales de A, estados sin aplicar y posiciones de fragmentos comprobados en el empaquetado.

## Lectura pública sin API

Guille indicó no utilizar la API y limitar la recopilación web a códigos de nuestra base. Se hizo una comprobación acotada con dos códigos ya presentes en la evidencia de A. No hubo consulta nueva a Supabase, cuenta, compra o uso de API. No se implementó un crawler de todo el sitio ni se eludieron controles de acceso.

- [Tonadita, 7798060850026](https://www.barcodelookup.com/7798060850026): el navegador mostró que el código no está en la base de esta fuente. No prueba que sea inválido.
- [Doritos, 7790310983737](https://www.barcodelookup.com/7790310983737): ficha encontrada, título Doritos, marca Doritos/Pepsico, Argentina en la descripción y una lista nutricional. Dice `Salt 1.66 g`, no sodio. La descripción menciona porción de 25 g, pero la lista nutricional no explicita su base. No se copia ni convierte para validar el sodio observado en Supabase o el valor de etiqueta de A.

La herramienta web inicialmente no pudo leer estas fichas; el navegador normal sí mostró los resultados anteriores. Esa limitación del primer acceso no se clasificó como ficha ausente. La extracción acotada se conserva en `etl/validacion/barcode-web-piloto-b.json`; estado sin aplicar y sin verificar.

Los términos del proveedor consultados en la revisión anterior restringen la recopilación automatizada fuera de la API. La preferencia actual de Guille es no usarla. Este piloto no se presenta como permiso del proveedor ni como autorización para saltar bloqueos. Antes de una ejecución masiva, resolver el acceso para ese uso; detenerse ante CAPTCHA, 403, 429, login o pago, sin rotar identidades o evadir límites. No usar una cuenta gratuita como alternativa oculta ni prometer una cuota web no publicada.

## Cómo continuar

Seguir ampliando B con textos concretos y comprobando falsos positivos/negativos. Una futura recopilación debe recibir solo una lista explícita de códigos del catálogo, preservar ceros iniciales, guardar fuente y fecha, distinguir ficha ausente de fallo de consulta y mantener límites de extracción por campo. Evitar búsqueda amplia por marcas o recorrer categorías del sitio. Cualquier coincidencia solo corrobora lo observado y comparable; no certifica el producto completo.

No conectar Barcode Lookup al request de escaneo ni estas propuestas al motor. No generar una función nueva de advertencias sin decisión del equipo. Resultados siempre en archivos locales para revisión; ninguna tabla se toca y no se publica nada sin Guille.
