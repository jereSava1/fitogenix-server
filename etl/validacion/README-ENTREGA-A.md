# Archivos de revisión — fase A

Leer primero docs/validacion/CIERRE-FASE-A.md (las entregas y pendientes originales están en docs/validacion/historial/). propuestas-finales-a.json es el único archivo de propuestas de este paquete: conserva valores actuales, candidatos, ambas lecturas y decisiones del usuario. evidencia-aportada-a.json documenta los cinco aportes del usuario y Sacaan oficial. No están aprobados para aplicación ni conectados al ETL.

## Control local sin claves ni red

Con Node 22, desde la raíz del repositorio:

```powershell
node etl/validacion/auditar-etiquetas-a.mjs etl/validacion/propuestas-finales-a.json work/controles-fase-a-nuevos.json
```

La salida debe ser nueva. Exit 0 significa que el informe se generó, no que las fuentes sean correctas. Los dos avisos numéricos conocidos de OFF y las cinco fotos pendientes/complementarias se explican en la entrega. controles-finales-a.json contiene el resultado de esta versión.

## Captura opcional de lectura

capturar.mjs contiene solamente requests GET, exige rama etl-validacion y comprueba el nombre del proyecto. No se ejecuta en la nueva rama de documentación. Si se necesita una captura nueva, usar una copia separada de etl-validacion y variables de entorno ya configuradas por el equipo; no guardar ni subir claves o capturas privadas.

```powershell
node etl/validacion/capturar.mjs --base --out work/base-fase-a-nueva.json
```

La captura anterior ya fue revisada: no hace falta repetirla para leer la entrega. No ejecutar migraciones, ETL, merge, scoring o compras de APIs. Supabase permanece solo lectura. La confirmación de publicación permite subir archivos nuevos, no autoriza aplicar las propuestas. No editar package.json ni archivos del servidor.
