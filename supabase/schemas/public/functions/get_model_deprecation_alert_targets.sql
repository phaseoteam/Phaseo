CREATE OR REPLACE FUNCTION public.get_model_deprecation_alert_targets (
  p_model_slugs        text[],
  p_since              timestamp with time zone,
  p_after_workspace_id uuid DEFAULT NULL::uuid,
  p_limit              integer DEFAULT 500
)
  RETURNS TABLE (
    workspace_id   uuid,
    model_slugs    text[],
    include_admins boolean
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  -- One row per alert-enabled workspace that recently requested any of the
  -- given models. Filtering happens here, before the page limit, so disabled
  -- workspaces never use up a page. Callers page by passing the last
  -- workspace_id they received; the limit is clamped below PostgREST's cap.
  select
    usage.workspace_id,
    array_agg(usage.model_slug order by usage.model_slug) as model_slugs,
    settings.model_deprecation_alerts_include_admins as include_admins
  from (
    select distinct fact.workspace_id, fact.requested_model_slug as model_slug
    from public.v2_request_facts fact
    where fact.requested_model_slug = any (p_model_slugs)
      and fact.occurred_at >= p_since
      and (p_after_workspace_id is null or fact.workspace_id > p_after_workspace_id)
  ) usage
  join public.workspace_settings settings
    on settings.workspace_id = usage.workspace_id
   and settings.model_deprecation_alerts_enabled
  group by usage.workspace_id, settings.model_deprecation_alerts_include_admins
  order by usage.workspace_id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_model_deprecation_alert_targets"(text[], timestamp WITH time zone, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_model_deprecation_alert_targets"(text[], timestamp WITH time zone, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_deprecation_alert_targets"(text[], timestamp WITH time zone, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_model_deprecation_alert_targets"(text[], timestamp WITH time zone, uuid, integer) FROM PUBLIC, "anon", "authenticated";
