CREATE OR REPLACE FUNCTION catalogue_private.history_model (
  p_row jsonb
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select coalesce(p_row->>'model_slug',
    (select model_slug from public.v2_model_provider_routes where provider_model_id=p_row->>'provider_model_id'),
    (select r.model_slug from public.v2_pricing_skus s join public.v2_model_provider_routes r using(provider_model_id) where s.sku_id=(p_row->>'sku_id')::uuid));
$function$;

REVOKE ALL ON FUNCTION "catalogue_private"."history_model"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "catalogue_private"."history_model"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "catalogue_private"."history_model"(jsonb) TO "postgres";
