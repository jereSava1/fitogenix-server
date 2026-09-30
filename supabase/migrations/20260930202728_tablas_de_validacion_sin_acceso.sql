-- B-04 paso 2 (D-07): nadie usa estas tablas. Se cierran a todos los roles de la API,
-- service_role incluido, durante 14 días antes del DROP (00-inventario §7.2).
REVOKE ALL ON TABLE public.productos_validados, public.registro_controles, public.validation_runs
  FROM anon, authenticated, service_role, PUBLIC;
REVOKE ALL ON SEQUENCE public.registro_controles_id_seq, public.validation_runs_id_seq
  FROM anon, authenticated, service_role, PUBLIC;
