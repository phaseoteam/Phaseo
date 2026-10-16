CREATE OR REPLACE FUNCTION public.get_requested_model_last_used_by_workspace (
  p_model_slugs  text[],
  p_since        timestamp with time zone,
  p_workspace_id uuid DEFAULT NULL::uuid
)
  RETURNS TABLE (
    workspace_id uuid,
    model_slug   text,
    last_used_at timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  -- Keyed on the model the caller asked for, not the one we routed to, so a
  -- workspace still calling a deprecated model is found even when another
  -- model served the request.
  select
    fact.workspace_id,
    fact.requested_model_slug as model_slug,
    max(fact.occurred_at) as last_used_at
  from public.v2_request_facts fact
  where fact.requested_model_slug = any (p_model_slugs)
    and fact.occurred_at >= p_since
    and (p_workspace_id is null or fact.workspace_id = p_workspace_id)
  group by fact.workspace_id, fact.requested_model_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_requested_model_last_used_by_workspace"(text[], timestamp WITH time zone, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_requested_model_last_used_by_workspace"(text[], timestamp WITH time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_requested_model_last_used_by_workspace"(text[], timestamp WITH time zone, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_requested_model_last_used_by_workspace"(text[], timestamp WITH time zone, uuid) FROM PUBLIC, "anon", "authenticated";
