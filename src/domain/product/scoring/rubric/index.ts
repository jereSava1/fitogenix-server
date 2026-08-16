/* ═══════════════════════════════════════════════════════════
   FITOGENIX — La rúbrica

   El documento de producto, traducido a datos. Un archivo por sección, para
   poder auditar el motor contra el spec sin leer una sola línea de lógica:

     scope.ts       §1  — cuándo no se puntúa
     anchors.ts     §3  — productos que SON un ingrediente
     impactTable.ts §4  — la tabla de ingredientes
     annulments.ts  §5  — lo que fuerza la categoría Malo
     labels.ts      §6 y §4.7 — lo que hay en una etiqueta y no es un ingrediente

   Nada de acá ejecuta nada: son constantes, patrones y tablas. Las consultas
   viven en `matching.ts` y los números del cálculo en `constants.ts`.

   Cuando cambie el documento, se toca esta carpeta y nada más.
═══════════════════════════════════════════════════════════ */

export * from './scope';
export * from './anchors';
export * from './impactTable';
export * from './annulments';
export * from './labels';
