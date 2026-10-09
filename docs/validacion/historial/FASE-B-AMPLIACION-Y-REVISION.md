# Fase B: detector reforzado y contraste de 11 códigos

Fecha: 2026-10-08. Preparado localmente en `revision/fase-b-texto-ingredientes-2026-10-08`. Continuación vigente de b-1 y b-2, conservados como historia. Sin publicación, merge, despliegue ni acceso nuevo a Supabase.

## Qué quedó hecho

Versión revisable del detector B y piloto sobre todos los códigos conocidos de los ocho casos de A. No se limpió el catálogo completo ni se aplicaron datos a la app. Hay código ejecutable: detector y comparador offline, con pruebas. No están conectados a los jobs del ETL, rutas del servidor o scoring. El comparador recibe archivos; no consulta la web. La lectura pública fue acotada y asistida desde el navegador, sin API, login, pago o evasión de controles.

Detector b-3: conserva la advertencia de Tonadita y las cantidades de ingredientes de Monster. No propone una receta si solo hay `Ingredientes: CONTIENE LECHE.`. Rechaza identidades vacías/repetidas, estructuras inválidas y códigos numéricos que podrían perder ceros iniciales. No inventa correcciones para OCR, INS o ingredientes ausentes.

En las 12 entradas: 3 requieren revisión, 4 sin ingredientes, 3 sin hallazgos de estas reglas y 2 conservadas sin limpieza. Ninguna lista candidata para sustituir textos de esta muestra. Sin hallazgos no significa verificado.

## Resultado de las fuentes

11 códigos conocidos: 7 encontrados y 4 ausentes del sitio. Protein Bar no se consultó porque no tiene código confirmado. Ausencia en una fuente no invalida un código.

| Producto | Código | Hallazgo y decisión |
|---|---|---|
| Ilolay 120 g | 7790787002931 | Repite Rallad0 y Sint; origen Spain pendiente. No resuelve OCR. |
| Ilolay, presentación pendiente | 7790787018031 | Seis cifras coinciden numéricamente; sin ingredientes visibles ni base explícita. |
| Ilolay 40 g | 7790787251780 | Siete cifras faltantes en la captura. Descripción menciona 10 g, pero no demuestra base de la tabla; origen Spain pendiente. |
| Ilolay Carrefour | 7790787251803 | No encontrado. |
| Pan Sacaan | 7793890001846 | Repite Aguo, Imaf y los INS dudosos; sin nutrición visible. |
| Bariloche 135 g | 7792430608637 | No encontrado; no copiar entre presentaciones. |
| Bariloche 80 g | 7792430608651 | No encontrado; no copiar entre presentaciones. |
| Doritos | 7790310983737 | Nueve coincidencias numéricas. Informa sal, no sodio; no resuelve 664 frente a 672 mg/100 g. |
| Rhodesia | 77995681 | Ficha mezcla fabricante LEGO y atributos de juguetes con alimento. Bloqueada para correcciones. |
| Monster | 0070847017332 | Tres cifras faltantes de interés. Mercado México y base pendiente; no convertir 100 g a 100 ml. |
| Tonadita | 7798060850026 | No encontrado. Mantener etiqueta aportada: sodio 20 mg por 10 g. |

El comparador registra 15 coincidencias numéricas, 6 diferencias y 14 campos faltantes con candidatos: siete Ilolay 40 g, tres Monster y cuatro Rhodesia. Los cuatro de Rhodesia quedan bloqueados por identidad conflictiva. **Ninguno de los 35 campos está habilitado para aplicar:** faltan base e identidad/fórmula. Dos sitios que repiten errores no constituyen evidencia independiente; no se demostró quién copió a quién.

Se guardan cifras y extractos visibles con enlaces. Las columnas `*_100g` son destinos potenciales, no prueba de que la cifra web ya sea por 100 g. No se multiplicó por porción, no se convirtió sal a sodio y no se reconstruyó una fórmula por nombre.

## Pruebas y límites

48 pruebas pasaron: 39 detector y 9 comparador. `typecheck`, `lint:deps`, `lint:unused`: salida 0. Pruebas con entorno ficticio y red externa bloqueada. Sin suite completa repetida porque no se modifica `src/`, contrato HTTP o dependencias. Empaquetado verifica hashes de nueve archivos originales de A, 12 textos originales, offsets y hashes de las entradas. No hay captura nueva ni cobertura del catálogo completo.

## Revisión de Guille y continuidad

1. Leer esta tabla y comparar los campos de abajo. Revisar que Rhodesia siga bloqueada y los nuevos valores no se tomen como validados.
2. Revisar los ejemplos del detector: advertencia de Tonadita y cantidad de Monster conservadas; OCR de Ilolay y Sacaan pendientes.
3. Si estás conforme, autorizar subir este paquete en una rama separada. La autorización para trabajar no reemplaza tu revisión antes de publicar. Se subirían herramientas/documentos, no filas de Supabase.
4. Jere puede ejecutar los comandos del README y revisar el diff. No ejecutar jobs `etl:merge`, `etl:fix-quality` o `etl:all` ni conectar esto al scoring.
5. Ampliar controles de falsos positivos/negativos con etiquetas legibles antes de ejecución general. Una exportación nueva de solo lectura podrá servir de entrada, sin claves en Git.
6. Mantener C (estándar nutricional) y D (lotes de 50) como pasos posteriores. La función nueva de advertencias requiere decisión del equipo; escribir en tablas sigue fuera de autorización.

B-10 y B-11 documentan las autoaprobaciones técnicas. Sin commit/push en este bloque. No necesitás programar ni pasar más credenciales para revisar esta entrega.

## Comparación campo por campo

Generada del JSON. Actual: captura de A, no consulta nueva. Faltante: ausente, no cero inferido. La unidad web se conserva; la base sigue pendiente en todas las filas.

| Producto | Campo | Actual por 100 g | Sitio (base pendiente) | Resultado |
|---|---|---|---|---|
| ilolay-otro | energy-kcal_100g | 500 | 500 kcal | coincidencia_numerica |
| ilolay-otro | fat_100g | 29 | 29 g | coincidencia_numerica |
| ilolay-otro | saturated-fat_100g | 18 | 18 g | coincidencia_numerica |
| ilolay-otro | carbohydrates_100g | 6 | 6 g | coincidencia_numerica |
| ilolay-otro | proteins_100g | 41 | 41 g | coincidencia_numerica |
| ilolay-otro | salt_100g | 1.1 | 1.1 g | coincidencia_numerica |
| ilolay-40 | energy-kcal_100g | Faltante | 45 kcal | dato_candidato_faltante |
| ilolay-40 | fat_100g | Faltante | 2.9 g | dato_candidato_faltante |
| ilolay-40 | saturated-fat_100g | Faltante | 1.8 g | dato_candidato_faltante |
| ilolay-40 | carbohydrates_100g | Faltante | 0.6 g | dato_candidato_faltante |
| ilolay-40 | proteins_100g | Faltante | 4.1 g | dato_candidato_faltante |
| ilolay-40 | salt_100g | Faltante | 0.11 g | dato_candidato_faltante |
| ilolay-40 | energy-kj_100g | Faltante | 188 kJ | dato_candidato_faltante |
| doritos | energy-kcal_100g | 504 | 504 kcal | coincidencia_numerica |
| doritos | fat_100g | 32 | 32 g | coincidencia_numerica |
| doritos | saturated-fat_100g | 3.6 | 3.6 g | coincidencia_numerica |
| doritos | carbohydrates_100g | 48 | 48 g | coincidencia_numerica |
| doritos | proteins_100g | 5.6 | 5.6 g | coincidencia_numerica |
| doritos | salt_100g | 1.66 | 1.66 g | coincidencia_numerica |
| doritos | energy-kj_100g | 2110 | 2110 kJ | coincidencia_numerica |
| doritos | sugars_100g | 2.4 | 2.4 g | coincidencia_numerica |
| doritos | fiber_100g | 8.8 | 8.8 g | coincidencia_numerica |
| rhodesia | energy-kcal_100g | 513.64 | 548 kcal | diferencia_numerica / ficha conflictiva |
| rhodesia | fat_100g | 27.27 | 29 g | diferencia_numerica / ficha conflictiva |
| rhodesia | saturated-fat_100g | 15 | 15.7 g | diferencia_numerica / ficha conflictiva |
| rhodesia | carbohydrates_100g | Faltante | 66.7 g | dato_candidato_faltante / ficha conflictiva |
| rhodesia | proteins_100g | 4.09 | 4.76 g | diferencia_numerica / ficha conflictiva |
| rhodesia | salt_100g | Faltante | 0.0524 g | dato_candidato_faltante / ficha conflictiva |
| rhodesia | energy-kj_100g | Faltante | 2290 kJ | dato_candidato_faltante / ficha conflictiva |
| rhodesia | sugars_100g | 45.45 | 47.6 g | diferencia_numerica / ficha conflictiva |
| rhodesia | fiber_100g | 3.18 | 3.33 g | diferencia_numerica / ficha conflictiva |
| rhodesia | cholesterol_100g | Faltante | 0.000952 g | dato_candidato_faltante / ficha conflictiva |
| monster | carbohydrates_100g | Faltante | 12.9 g | dato_candidato_faltante |
| monster | sugars_100g | Faltante | 11.5 g | dato_candidato_faltante |
| monster | salt_100g | Faltante | 0.152 g | dato_candidato_faltante |

### Fuentes leídas

- [ilolay-120: 7790787002931](https://www.barcodelookup.com/7790787002931)
- [ilolay-otro: 7790787018031](https://www.barcodelookup.com/7790787018031)
- [ilolay-40: 7790787251780](https://www.barcodelookup.com/7790787251780)
- [ilolay-carrefour: 7790787251803](https://www.barcodelookup.com/7790787251803)
- [sacaan: 7793890001846](https://www.barcodelookup.com/7793890001846)
- [bariloche-135: 7792430608637](https://www.barcodelookup.com/7792430608637)
- [bariloche-80: 7792430608651](https://www.barcodelookup.com/7792430608651)
- [doritos: 7790310983737](https://www.barcodelookup.com/7790310983737)
- [rhodesia: 77995681](https://www.barcodelookup.com/77995681)
- [monster: 0070847017332](https://www.barcodelookup.com/0070847017332)
- [tonadita: 7798060850026](https://www.barcodelookup.com/7798060850026)
