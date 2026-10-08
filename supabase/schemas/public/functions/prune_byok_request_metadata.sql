CREATE OR REPLACE FUNCTION public.prune_byok_request_metadata (
  p_retention_days integer DEFAULT 90,
  p_batch_size     integer DEFAULT 10000
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if p_retention_days is null or p_retention_days < 90 or p_retention_days > 3650
    or p_batch_size is null or p_batch_size < 1 or p_batch_size > 50000 then
    raise exception 'Invalid BYOK metadata prune parameters';
  end if;
  return jsonb_build_object('cutoff', now() - make_interval(days => p_retention_days),
    'v2_deleted', 0, 'legacy_deleted', 0, 'retention_policy', 'permanent_usage');
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) TO "service_role";

COMMENT ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) IS 'Compatibility no-op: gateway and normalized usage records are retained permanently.';

REVOKE ALL ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) FROM PUBLIC, "anon", "authenticated";
