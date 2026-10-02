-- T-03 · Muestra del catálogo para el golden de scoreProduct (solo lectura).
-- NOTA (2026-09-29): la muestra que quedó en el repo no salió de esta consulta
-- sino de PostgREST con la secret key (a pedido del responsable): las primeras
-- 200 filas con ingredientes o nutrientes en orden de id, mismas columnas. Solo
-- el 32% de las filas tiene datos crudos (DT-01). Esta consulta sirve para
-- tomar otra muestra si hace falta.
-- Devuelve UNA fila con UNA celda: un array JSON de 200 productos. Copiar la
-- celda entera (o exportar el resultado como JSON) y pasármela.
-- Sin id, barcode, marca ni imagen: solo lo que usa el motor. El orden por
-- md5(id) hace que la muestra sea la misma si se vuelve a correr.
select json_agg(t) as muestra
from (
  select product_name, category, ingredients_text, nutriments, additives_tags
  from products
  where coalesce(ingredients_text, '') <> ''
     or coalesce(nutriments, '{}'::jsonb) <> '{}'::jsonb
  order by md5(id::text)
  limit 200
) t;
