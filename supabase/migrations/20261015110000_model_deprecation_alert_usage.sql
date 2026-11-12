-- Model deprecation alerts never matched a workspace: both callers passed p_workspace_id to
-- get_workspace_model_last_used (parameter p_team_id), and its is_workspace_member guard reads
-- auth.uid(), which is null for the service-role cron and web API. This adds a service-role
-- lookup keyed on the requested model, plus an opt-in to also email workspace admins.
-- The cron reads alert targets through get_model_deprecation_alert_targets, which filters to
-- alert-enabled workspaces in the database and pages by workspace_id.
SET local check_function_bodies = off;

ALTER TABLE "public"."workspace_settings"
  ADD COLUMN "model_deprecation_alerts_include_admins" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."workspace_settings"."model_deprecation_alerts_include_admins" IS 'Also email workspace admins, not only the owner, when a model the workspace recently called is deprecated.';

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
