-- B-04 paso 3 (D-07) y B-01b (D-41, D-88). Backup en la máquina del responsable
-- (docs/sql/b04). Guardados e historial de las filas 'ai' se van en cascada.
DROP TABLE IF EXISTS public.productos_validados, public.registro_controles, public.validation_runs;

DELETE FROM public.products WHERE data_source = 'ai';
