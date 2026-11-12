CREATE OR REPLACE FUNCTION public.list_slack_agent_due_charges (
  p_before date,
  p_limit  integer DEFAULT 200
)
  RETURNS TABLE (
    installation_id   uuid,
    workspace_id      uuid,
    period_start      date,
    people            integer,
    answers           bigint,
    monthly_cap_nanos bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Months that ended before p_before and have no completed charge. Never-tried
  -- months come first, then the longest-waiting retries, so a backlog of
  -- workspaces short of credits cannot starve the rest.
  select person.installation_id, installation.workspace_id, person.period_start,
    count(*)::integer, sum(person.answers)::bigint, installation.monthly_cap_nanos
  from public.slack_agent_monthly_people person
  join public.slack_installations installation on installation.id = person.installation_id
  left join public.slack_agent_charges charge
    on charge.installation_id = person.installation_id and charge.period_start = person.period_start
  where person.period_start < p_before
    and coalesce(charge.status, 'pending') = 'pending'
  group by person.installation_id, installation.workspace_id, person.period_start,
    installation.monthly_cap_nanos, charge.attempted_at
  order by charge.attempted_at nulls first, person.period_start, person.installation_id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$function$;

COMMENT ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) IS 'People and pooled answers per installation for each finished UTC month that has not been charged yet, for the month-end charge job.';

GRANT EXECUTE ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) FROM PUBLIC, "anon", "authenticated";
