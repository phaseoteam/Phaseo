CREATE OR REPLACE FUNCTION public.gateway_fetch_public_catalog (
  p_model     text,
  p_endpoints text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- Preserves the original snapshot shape for deployed gateways whose strict
  -- schema rejects the revision/boundary fields added by the _at variant.
  return public.gateway_fetch_public_catalog_at(p_model, p_endpoints, now()) - 'revision' - 'boundaryAt';
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_public_catalog"(text, text[]) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_fetch_public_catalog"(text, text[]) IS 'Returns public catalog snapshots including provider-level routing override metadata for gateway context enrichment.';

REVOKE ALL ON FUNCTION "public"."gateway_fetch_public_catalog"(text, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_public_catalog"(text, text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_public_catalog"(text, text[]) FROM PUBLIC, "anon", "authenticated";
