CREATE OR REPLACE FUNCTION public.public_leaderboard_model_id (
  p_canonical_model_id text,
  p_model_id           text,
  p_requested_model_id text,
  p_routed_model_id    text,
  p_api_model_id       text,
  p_provider           text,
  p_pricing_plan       text,
  p_is_free_variant    boolean
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select case
    when coalesce(p_is_free_variant, false)
      or lower(coalesce(p_pricing_plan, '')) = 'free'
      or lower(coalesce(p_api_model_id, '')) like '%:free'
      or lower(coalesce(p_routed_model_id, '')) like '%:free'
      or lower(coalesce(p_model_id, '')) like '%:free'
      or lower(coalesce(p_requested_model_id, '')) like '%:free'
      or lower(coalesce(p_canonical_model_id, '')) like '%:free'
    then coalesce(
      nullif(p_api_model_id, ''),
      nullif(p_routed_model_id, ''),
      nullif(p_model_id, ''),
      nullif(p_requested_model_id, ''),
      nullif(p_canonical_model_id, ''),
      public.resolve_public_model_id(p_model_id, p_provider),
      'unknown'
    )
    else coalesce(
      nullif(p_canonical_model_id, ''),
      public.resolve_public_model_id(p_model_id, p_provider),
      nullif(p_routed_model_id, ''),
      nullif(p_requested_model_id, ''),
      nullif(p_api_model_id, ''),
      nullif(p_model_id, ''),
      'unknown'
    )
  end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."public_leaderboard_model_id"(text, text, text, text, text, text, text, boolean) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."public_leaderboard_model_id"(text, text, text, text, text, text, text, boolean) TO "service_role";

COMMENT ON FUNCTION "public"."public_leaderboard_model_id"(text, text, text, text, text, text, text, boolean) IS 'Returns the model id used for public leaderboard aggregation, preserving free executed variants while keeping paid rows canonical.';

REVOKE ALL ON FUNCTION "public"."public_leaderboard_model_id"(text, text, text, text, text, text, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."public_leaderboard_model_id"(text, text, text, text, text, text, text, boolean) TO "postgres";
