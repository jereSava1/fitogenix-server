# Entrega final para confirmar — fase A

Preparada el 08/10/2026 para jereSava1/fitogenix-server. Rama propuesta: revision/fase-a-2026-10-08, creada desde etl-validacion (commit 53cbc6e9cf72113f983cdc195dff3030564d68e7). La rama remota etl-validacion se comprobó por lectura y conserva ese commit. La rama propuesta aún no fue creada ni publicada.

## Resultado

Se investigaron ocho casos, con once EAN localizados en Supabase y Protein PM-24 sin identidad confirmada. Se compararon ingredientes y nutrientes con registros de fuentes y etiquetas, conservando fechas, unidades, faltantes, conflictos y evidencia por campo. La captura de Supabase corresponde al 08/10/2026 a las 15:09 UTC. Los datos no se vuelven a consultar al abrir estos documentos.

Supabase fue solo lectura. No hubo actualizaciones, tablas nuevas, SQL, RPC ni migraciones. No se modificaron main, archivos del servidor, scoring o ETL. No hubo commit, push ni PR. La entrega contiene únicamente archivos nuevos en docs/validacion y etl/validacion.

## Estado de los ocho casos

| Caso | Resultado actual | Límite |
| --- | --- | --- |
| Ilolay, cuatro códigos | Ingredientes y nutrición con faltantes/conflictos. Una foto frontal muestra 115 g. | No copiar recetas entre EAN; falta confirmar etiquetas correspondientes. |
| Sacaan | Búsqueda cerrada por ahora. Información incompleta. | No rellenar faltantes; gráfico oficial de correspondencia pendiente. |
| Bariloche 80/135 g | Presentaciones distintas confirmadas; tabla sin respaldo completo. | Carbohidratos y foto nutricional pendientes. |
| Doritos | Diferencia de sodio entre etiqueta y registro; ingredientes ausentes. | Mantener candidatos y faltantes. |
| Rhodesia | Diferencias entre fuentes y un %VD parcialmente leído. | No elegir automáticamente cifras ni convertir trans cualitativas en cero. |
| Monster | Tabla legible de envase mexicano antiguo. | Vigencia/mercado pendientes; mantener 100 ml separado de 100 g. |
| Protein PM-24 | Sabor desconocido. Cuatro tablas oficiales documentadas aparte. | No asociar tabla o EAN a PM-24. |
| Tonadita | Usuario confirma 20 mg de sodio por 10 g. | Referencia seleccionada para revisión: 0,2 g/100 g derivado. No aplicada. |

## Tus últimas decisiones incorporadas

Tonadita usa como referencia los 20 mg de sodio por 10 g que confirmaste. Los 0,2 g por 100 g se guardan como cálculo, no como columna leída. El antecedente de 12 mg queda preservado y su discrepancia se resuelve para esta revisión por tu confirmación; no se presenta como comprobación independiente de fecha/fórmula. La base ya tiene 0,2 g por 100 g: esta selección no requiere proponer un cambio numérico de sodio en la base observada.

Sacaan permanece incompleto y no seguimos buscando por ahora. La web ofrece 119 kcal, 22 g de carbohidratos, 0,2 g de grasas saturadas y 216 mg de sodio, pero reutiliza el gráfico para varios productos. No se asignan esos valores a nuestro EAN sin confirmar correspondencia, ni se reconstruye una tabla completa.

Protein PM-24 queda sin sabor ni código. La fuente oficial distingue Cookies & Cream (45 g, 15 g de proteína/barra), Peanut Butter (45 g, 16 g), Dulce de leche (50 g, 17 g) y Galleta de limón (50 g, 17 g). Las dos últimas tablas publican cifras iguales; los productos permanecen separados. No se contrató ni integró Barcode Lookup.

Fuente: https://raptornutricion.com/productos/raptor-protein-barras.html

## Verificación y evidencia

Primera revisión: 14 fotos y nueve pares con coincidencia completa en los datos comparados. Sacaan parcialmente ilegible; Rhodesia con un %VD pendiente; tres fotos complementarias sin par estructurado completo. Nuevos aportes: cinco imágenes del usuario más un gráfico de Sacaan, con cantidades, unidades y porcentajes leídos independientemente y coincidentes. Los sabores se relacionaron después con los encabezados y tablas de la web oficial. La coincidencia de lecturas no prueba vigencia, identidad exacta ni ausencia de conflictos externos.

Sobre la rama original con Node 22: typecheck, lint:deps y lint:unused pasaron; 63 archivos de test y 1036 pruebas pasaron. contract:check falló inicialmente por CRLF y pasó normalizando solamente la lectura de sus JSON a LF, sin modificar contratos. Los nuevos scripts se verifican aparte; los resultados del servidor no equivalen a aprobación de datos nutricionales. Ver chequeos-fase-a.md.

El auditor conserva avisos de dos fuentes comunitarias de OFF donde azúcar añadido supera al total: Rhodesia y Monster. No son valores adoptados. Los controles energéticos son informativos y no aplican tolerancias inventadas. Las frases cualitativas siguen siendo texto y no cero. Ningún campo está autorizado para aplicar: approved=false y applied=false.

## Qué se pide confirmar

Publicar estos nueve archivos nuevos en la rama revision/fase-a-2026-10-08 del repositorio indicado, sin modificar main ni la base. La confirmación habilitaría crear la rama, hacer el commit y subir estos archivos; no habilita merge, PR, ejecución de ETL, scoring, migraciones, fase B, compra de servicios o cambios en Supabase.

Los archivos y sus hashes se enumeran en MANIFIESTO.json, que acompaña el paquete local. Si cambia la rama base o aparece un archivo con la misma ruta, hay que detener la publicación y revisar la colisión; no sobrescribir archivos existentes.

## Después de publicar

El equipo revisa la documentación y responde las decisiones pendientes de visualización, verificación, mínimos de datos, procedencia por campo y tratamiento de líquidos. Son decisiones de producto y de implementación; no se modifican reglas para resolverlas sin autorización. La siguiente fase se concreta y se pide confirmar aparte. Los casos incompletos no impiden entregar esta fase documental, pero no se declaran productos totalmente validados.
