CREATE OR REPLACE FUNCTION public.get_public_model_retention_rankings (
  p_weeks               integer DEFAULT 10,
  p_limit               integer DEFAULT 20,
  p_min_workspace_weeks integer DEFAULT 25,
  p_min_workspaces      integer DEFAULT 5,
  p_min_weeks           integer DEFAULT 2
)
  RETURNS TABLE (
    model_id                  text,
    retention_rate            numeric,
    returning_workspace_weeks bigint,
    workspace_weeks           bigint,
    unique_workspaces         bigint,
    weeks_observed            integer,
    confidence_low            numeric,
    confidence_high           numeric,
    first_cohort_week         date,
    last_cohort_week          date,
    rank                      integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select date_trunc('week', now() at time zone 'utc')::date as current_week,
      greatest(1, least(coalesce(p_weeks, 10), 52))::integer as requested_weeks
  ),
  eligible_transitions as (
    select cohort.week_start as cohort_week, cohort.model_id, cohort.workspace_hash,
      (returned.workspace_hash is not null) as returned
    from public.public_model_workspace_usage_weekly cohort
    cross join bounds
    left join public.public_model_workspace_usage_weekly returned
      on returned.week_start = cohort.week_start + 7
     and returned.model_id = cohort.model_id
     and returned.workspace_hash = cohort.workspace_hash
    where cohort.week_start >= bounds.current_week - (bounds.requested_weeks + 1) * interval '1 week'
      and cohort.week_start < bounds.current_week - interval '1 week'
  ),
  aggregated as (
    select transition.model_id,
      count(*)::bigint as workspace_weeks,
      count(*) filter (where transition.returned)::bigint as returning_workspace_weeks,
      count(distinct transition.workspace_hash)::bigint as unique_workspaces,
      count(distinct transition.cohort_week)::integer as weeks_observed,
      min(transition.cohort_week)::date as first_cohort_week,
      max(transition.cohort_week)::date as last_cohort_week
    from eligible_transitions transition
    group by transition.model_id
    having count(*) >= greatest(25, coalesce(p_min_workspace_weeks, 25))
      and count(distinct transition.workspace_hash) >= greatest(5, coalesce(p_min_workspaces, 5))
      and count(distinct transition.cohort_week) >= greatest(2, coalesce(p_min_weeks, 2))
  ),
  scored as (
    select aggregate.*,
      aggregate.returning_workspace_weeks::numeric / nullif(aggregate.workspace_weeks, 0) as rate,
      1.96::numeric as z
    from aggregated aggregate
  ),
  confidence as (
    select scored.*,
      (scored.rate + scored.z * scored.z / (2 * scored.workspace_weeks))
        / (1 + scored.z * scored.z / scored.workspace_weeks) as centre,
      scored.z * sqrt(
        (scored.rate * (1 - scored.rate) + scored.z * scored.z / (4 * scored.workspace_weeks))
        / scored.workspace_weeks
      ) / (1 + scored.z * scored.z / scored.workspace_weeks) as margin
    from scored
  ),
  ranked as (
    select confidence.*,
      row_number() over (
        order by confidence.rate desc, confidence.workspace_weeks desc, confidence.model_id
      )::integer as position
    from confidence
  )
  select ranked.model_id, round(ranked.rate * 100, 1), ranked.returning_workspace_weeks,
    ranked.workspace_weeks, ranked.unique_workspaces, ranked.weeks_observed,
    round(greatest(0, ranked.centre - ranked.margin) * 100, 1),
    round(least(1, ranked.centre + ranked.margin) * 100, 1),
    ranked.first_cohort_week, ranked.last_cohort_week, ranked.position
  from ranked
  order by ranked.position
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_model_retention_rankings"(integer, integer, integer, integer, integer) TO "service_role";

COMMENT ON FUNCTION "public"."get_public_model_retention_rankings"(integer, integer, integer, integer, integer) IS 'Ranks canonical models by the share of Phaseo workspaces returning in the following completed UTC week.';

REVOKE ALL ON FUNCTION "public"."get_public_model_retention_rankings"(integer, integer, integer, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_model_retention_rankings"(integer, integer, integer, integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_model_retention_rankings"(integer, integer, integer, integer, integer) FROM PUBLIC, "anon", "authenticated";
