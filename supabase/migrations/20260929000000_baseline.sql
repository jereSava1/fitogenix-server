-- Baseline (C-05, ADR-0009): el schema `public` de producción al 2026-09-29, tomado con
-- `supabase db dump`. La tabla `waitlist` va aparte, en su migración (20260930115256).
-- Al final, lo que el dump no trae: el trigger de auth.users y los REVOKE de U-01.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, first_name, last_name, username)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'username'
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_username_available"("candidate" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(trim(candidate)));
$$;


ALTER FUNCTION "public"."is_username_available"("candidate" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "barcode" "text",
    "product_name" "text" NOT NULL,
    "brand" "text",
    "category" "text",
    "image_url" "text",
    "score" integer,
    "score_label" "text" NOT NULL,
    "sello" "text",
    "data_source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ingredients_text" "text",
    "nutriments" "jsonb",
    "nova_group" integer,
    "additives_tags" "jsonb",
    "ai_enriched" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "engine_version" "text",
    "name_key" "text",
    "manufacturer_info" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON TABLE "public"."products" IS 'Caché persistente de productos. Guarda datos CRUDOS (ingredients_text, nutriments, nova_group, additives_tags) para recomputar el score con el ftgEngine vigente en cada lectura, no el score ya calculado. Identidad = id (uuid); barcode y name_key son atributos de búsqueda opcionales y mutuamente no excluyentes (una fila upgradeada de name→barcode conserva ambos).';



COMMENT ON COLUMN "public"."products"."id" IS 'Identidad estable del producto (uuid). No cambia nunca, ni siquiera cuando la fila hace upgrade de name_key a barcode. Es lo que referencian saved_products.product_id y scan_history.product_id.';



COMMENT ON COLUMN "public"."products"."barcode" IS 'Atributo de búsqueda opcional (UNIQUE, nullable). Presente cuando el producto matcheó por código de barras (OFF/OBF/Edamam o IA con barcode como hint). Null en filas resueltas solo por nombre vía IA.';



COMMENT ON COLUMN "public"."products"."score" IS 'Puntaje Fitogenix DENORMALIZADO para listados (0-100), o NULL cuando el motor decide no puntuar (§1 del motor v2.1: fuera de alcance, sin datos suficientes, lista no identificable). NULL NO significa 0: la ausencia de datos nunca mejora ni empeora un puntaje, se declara. La fuente de verdad es el recómputo desde los crudos (ver COMMENT ON TABLE products); esta columna puede estar calculada con un engine_version viejo.';



COMMENT ON COLUMN "public"."products"."sello" IS 'Sello derivado del score, DENORMALIZADO para listados. Los cortes NO se escriben acá: viven en src/domain/product/scoring/constants.ts (TIERS, EXCELLENT_FROM, BAD_BELOW) y se derivan en scoring/presentation.ts -> getSello. La banda más alta lleva el sello positivo y la más baja el negativo, por definición de banda y no por coincidencia numérica (ADR-007). NULL en las bandas del medio, y también cuando no hay puntaje: sin datos no ponemos ninguno de los dos. Como toda columna denormalizada, puede estar calculada con un engine_version viejo; la fuente de verdad es el recómputo desde los crudos.';



COMMENT ON COLUMN "public"."products"."data_source" IS 'Proveedor original del dato crudo: off | obf | edamam | ai. "ai" son las filas más volátiles (inventadas por Claude sin respaldo de una base pública) — TTL de Redis más corto (3 días vs 7) y candidatas a revalidación si el producto real aparece después en OFF.';



COMMENT ON COLUMN "public"."products"."engine_version" IS 'Versión del motor de scoring (ftgEngine.ENGINE_VERSION, ej. "ftg-rubric-v1") vigente cuando se escribió/refrescó esta fila. Filas con un valor distinto al ENGINE_VERSION actual (o NULL, para filas pre-001) tienen un score potencialmente obsoleto — candidatas a recompute por el Agente ETL o a invalidación selectiva por el Agente de Datos.';



COMMENT ON COLUMN "public"."products"."name_key" IS 'Atributo de búsqueda opcional (UNIQUE, nullable). Query de texto normalizado (minúsculas, sin acentos, espacios colapsados — ver queryNormalization.ts) SIN prefijo, que originó una fila resuelta SOLO por IA (sin match en OFF). Permite servir la segunda búsqueda idéntica por nombre desde cache sin invocar a Claude. Se conserva como alias si la fila hace upgrade a barcode.';



COMMENT ON COLUMN "public"."products"."manufacturer_info" IS 'Info de fabricante/razón social/dirección/RNE-RNPA extraída de ingredients_text corrupto durante la auditoría de calidad de datos (ver scripts/etl/jobs/fixDataQuality.ts). No se usa en scoring ni se muestra en la app hoy — solo preservación de dato real en vez de descartarlo.';



CREATE OR REPLACE FUNCTION "public"."search_products_by_name"("search_query" "text", "match_limit" integer DEFAULT 5) RETURNS SETOF "public"."products"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT *
  FROM products
  WHERE product_name ILIKE '%' || search_query || '%'
     OR product_name % search_query
  ORDER BY
    similarity(product_name, search_query) DESC,
    (barcode IS NOT NULL) DESC,  -- entre empates, preferimos filas con datos reales (no solo-IA)
    length(product_name) ASC     -- y el nombre más corto (match más ajustado)
  LIMIT match_limit;
$$;


ALTER FUNCTION "public"."search_products_by_name"("search_query" "text", "match_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_products_by_name"("search_query" "text", "match_limit" integer) IS 'Búsqueda de texto contra el catálogo propio, rankeada por similitud (pg_trgm). Único mecanismo de resolución por nombre desde 2026-08-18: no hay cascada a OFF/IA si no encuentra nada acá.';



CREATE TABLE IF NOT EXISTS "public"."productos_validados" (
    "product_id" "uuid" NOT NULL,
    "barcode" "text",
    "product_name" "text",
    "brand" "text",
    "ingredients_text" "text",
    "nutriments" "jsonb" NOT NULL,
    "fuentes" "jsonb" NOT NULL,
    "campos_verificados" "text"[] NOT NULL,
    "notas" "text",
    "validado_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revisado" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."productos_validados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products_staging" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "barcode" "text",
    "raw_payload" "jsonb" NOT NULL,
    "run_id" "text" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "merge_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "discard_reason" "text",
    "merged_at" timestamp with time zone,
    "merged_into" "uuid",
    CONSTRAINT "products_staging_status_check" CHECK (("merge_status" = ANY (ARRAY['pending'::"text", 'merged'::"text", 'merged_incomplete'::"text", 'discarded_incomplete'::"text", 'enriched'::"text"])))
);


ALTER TABLE "public"."products_staging" OWNER TO "postgres";


COMMENT ON TABLE "public"."products_staging" IS 'Banco de trabajo del Agente ETL. Datos crudos ya adaptados a RawOFFProduct, de una o más fuentes, ANTES del merge por barcode y el gate de completitud. Nunca la lee el servidor de producción ni el cliente — solo el pipeline de ingesta. Ver 06-agente-etl-data.md, Fase 3.';



COMMENT ON COLUMN "public"."products_staging"."merge_status" IS 'pending: sin procesar. merged: escrito en products con datos completos. merged_incomplete: escrito en products, pero sin ingredientes ni tabla nutricional suficientes para puntuar — candidato a enriquecimiento. discarded_incomplete: no se escribió (estado histórico, previo a la migración 010). enriched: completado con IA antes de escribirse.';



COMMENT ON COLUMN "public"."products_staging"."merged_into" IS 'products.id de la fila final a la que contribuyó esta fila de staging tras el merge. Null mientras está pending, o si fue descartada por el gate de completitud sin llegar a mergearse.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "username" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registro_controles" (
    "id" bigint NOT NULL,
    "product_id" "uuid" NOT NULL,
    "barcode" "text",
    "field" "text" NOT NULL,
    "rule" "text",
    "current_value" "text",
    "proposed_value" "text",
    "verdict" "text" NOT NULL,
    "source_name" "text",
    "source_url" "text",
    "evidence" "text",
    "confidence" "text",
    "notes" "text",
    "checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied" boolean DEFAULT false NOT NULL,
    CONSTRAINT "registro_controles_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "registro_controles_verdict_check" CHECK (("verdict" = ANY (ARRAY['match'::"text", 'mismatch'::"text", 'filled'::"text", 'not_found'::"text", 'conflict'::"text", 'impossible'::"text"])))
);


ALTER TABLE "public"."registro_controles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."registro_controles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."registro_controles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."registro_controles_id_seq" OWNED BY "public"."registro_controles"."id";



CREATE TABLE IF NOT EXISTS "public"."saved_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_id" "uuid" NOT NULL
);


ALTER TABLE "public"."saved_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scan_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scanned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_id" "uuid" NOT NULL
);


ALTER TABLE "public"."scan_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."validation_runs" (
    "id" bigint NOT NULL,
    "phase" "text" NOT NULL,
    "batch_no" integer NOT NULL,
    "last_product_id" "uuid",
    "processed" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "notes" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "validation_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."validation_runs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."validation_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."validation_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."validation_runs_id_seq" OWNED BY "public"."validation_runs"."id";










ALTER TABLE ONLY "public"."registro_controles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."registro_controles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."validation_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."validation_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."productos_validados"
    ADD CONSTRAINT "productos_validados_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_name_key_key" UNIQUE ("name_key");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products_staging"
    ADD CONSTRAINT "products_staging_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registro_controles"
    ADD CONSTRAINT "registro_controles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_products"
    ADD CONSTRAINT "saved_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_products"
    ADD CONSTRAINT "saved_products_user_product_key" UNIQUE ("user_id", "product_id");



ALTER TABLE ONLY "public"."scan_history"
    ADD CONSTRAINT "scan_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scan_history"
    ADD CONSTRAINT "scan_history_user_product_key" UNIQUE ("user_id", "product_id");



ALTER TABLE ONLY "public"."validation_runs"
    ADD CONSTRAINT "validation_runs_phase_batch_no_key" UNIQUE ("phase", "batch_no");



ALTER TABLE ONLY "public"."validation_runs"
    ADD CONSTRAINT "validation_runs_pkey" PRIMARY KEY ("id");






CREATE UNIQUE INDEX "products_barcode_unique_idx" ON "public"."products" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "products_data_source_idx" ON "public"."products" USING "btree" ("data_source");



CREATE INDEX "products_engine_version_idx" ON "public"."products" USING "btree" ("engine_version");



CREATE INDEX "products_missing_ingredients_idx" ON "public"."products" USING "btree" ("updated_at") WHERE (("ingredients_text" IS NULL) OR ("length"("btrim"("ingredients_text")) < 5));



COMMENT ON INDEX "public"."products_missing_ingredients_idx" IS 'Cola de enriquecimiento: productos sin lista de ingredientes utilizable. Los llena etl:enrich-cencosud consultando Jumbo/Disco/Vea por EAN (fq=alternateIds_Ean), que publican Ingredientes y Tabla Nutricional reales para ~58% de los casos.';



CREATE INDEX "products_name_trgm_idx" ON "public"."products" USING "gin" ("product_name" "public"."gin_trgm_ops");



COMMENT ON INDEX "public"."products_name_trgm_idx" IS 'Acelera la búsqueda de texto contra el catálogo propio (search_products_by_name / findCachedProductByName): sin este índice, todo ILIKE %...% sobre product_name es un sequential scan de la tabla entera.';



CREATE INDEX "products_staging_barcode_idx" ON "public"."products_staging" USING "btree" ("barcode");



CREATE INDEX "products_staging_run_id_idx" ON "public"."products_staging" USING "btree" ("run_id");



CREATE INDEX "products_staging_status_idx" ON "public"."products_staging" USING "btree" ("merge_status");



CREATE UNIQUE INDEX "profiles_username_unique_idx" ON "public"."profiles" USING "btree" ("lower"("username"));



CREATE INDEX "registro_controles_product_idx" ON "public"."registro_controles" USING "btree" ("product_id");



CREATE UNIQUE INDEX "registro_controles_uniq" ON "public"."registro_controles" USING "btree" ("product_id", "field", "source_name", "rule") NULLS NOT DISTINCT;



CREATE INDEX "registro_controles_verdict_idx" ON "public"."registro_controles" USING "btree" ("verdict");



CREATE INDEX "saved_products_user_idx" ON "public"."saved_products" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "scan_history_user_idx" ON "public"."scan_history" USING "btree" ("user_id", "scanned_at" DESC);






ALTER TABLE ONLY "public"."productos_validados"
    ADD CONSTRAINT "productos_validados_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."products_staging"
    ADD CONSTRAINT "products_staging_merged_into_fkey" FOREIGN KEY ("merged_into") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registro_controles"
    ADD CONSTRAINT "registro_controles_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."saved_products"
    ADD CONSTRAINT "saved_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_products"
    ADD CONSTRAINT "saved_products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scan_history"
    ADD CONSTRAINT "scan_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scan_history"
    ADD CONSTRAINT "scan_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));






ALTER TABLE "public"."productos_validados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products_staging" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registro_controles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_products_delete_own" ON "public"."saved_products" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_products_insert_own" ON "public"."saved_products" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_products_select_own" ON "public"."saved_products" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."scan_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scan_history_delete_own" ON "public"."scan_history" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "scan_history_insert_own" ON "public"."scan_history" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "scan_history_select_own" ON "public"."scan_history" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "scan_history_update_own" ON "public"."scan_history" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."validation_runs" ENABLE ROW LEVEL SECURITY;






ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_username_available"("candidate" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_username_available"("candidate" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_username_available"("candidate" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_username_available"("candidate" "text") TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_products_by_name"("search_query" "text", "match_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_products_by_name"("search_query" "text", "match_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."productos_validados" TO "anon";
GRANT ALL ON TABLE "public"."productos_validados" TO "authenticated";
GRANT ALL ON TABLE "public"."productos_validados" TO "service_role";



GRANT ALL ON TABLE "public"."products_staging" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."registro_controles" TO "anon";
GRANT ALL ON TABLE "public"."registro_controles" TO "authenticated";
GRANT ALL ON TABLE "public"."registro_controles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registro_controles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registro_controles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registro_controles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."saved_products" TO "anon";
GRANT ALL ON TABLE "public"."saved_products" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_products" TO "service_role";



GRANT ALL ON TABLE "public"."scan_history" TO "anon";
GRANT ALL ON TABLE "public"."scan_history" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_history" TO "service_role";



GRANT ALL ON TABLE "public"."validation_runs" TO "anon";
GRANT ALL ON TABLE "public"."validation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."validation_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."validation_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."validation_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."validation_runs_id_seq" TO "service_role";












ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- El dump solo trae `public`: el trigger que crea el perfil al registrarse vive en auth.users.
CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

-- pg_dump no escribe los REVOKE: sin esto, los permisos por defecto de `public` dejarían el
-- catálogo abierto a anon y authenticated en una base nueva (SEC-01, U-01).
REVOKE ALL ON TABLE "public"."products" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."products_staging" FROM "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."search_products_by_name"("search_query" "text", "match_limit" integer) FROM "anon", "authenticated";
