CREATE OR REPLACE FUNCTION public.list_slack_agent_installations (
  p_period_start date,
  p_limit        integer DEFAULT 100,
  p_offset       integer DEFAULT 0
)
  RETURNS TABLE (
    installation_id   uuid,
    workspace_id      uuid,
    workspace_name    text,
    team_id           text,
    team_name         text,
    enterprise_id     text,
    custom_app        boolean,
    slack_app_id      text,
    status            text,
    installed_at      timestamp with time zone,
    uninstalled_at    timestamp with time zone,
    plan_people       integer,
    monthly_cap_nanos bigint,
    people            integer,
    answers           bigint,
    model_requests    bigint,
    model_cost_nanos  bigint,
    total             bigint
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
#variable_conflict use_column
-- Every Slack agent installation, newest first, for the internal Slack agent page:
-- one row each with the month's people and pooled answers and the model requests
-- and spend through the installation's own key, all summed here so the page never
-- adds up rows itself. total counts every installation, for paging. Service role
-- only: web-api checks that the caller is a Phaseo admin first.
begin
  if p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'invalid_period_start' using errcode = '22023';
  end if;

  return query
  with page as (
    select installation.*, count(*) over () as total
    from public.slack_installations installation
    order by installation.installed_at desc, installation.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select page.id,
    page.workspace_id,
    workspace.name,
    page.team_id,
    page.team_name,
    page.enterprise_id,
    page.slack_app_id is not null,
    app.slack_app_id,
    page.status,
    page.installed_at,
    page.uninstalled_at,
    page.plan_people,
    page.monthly_cap_nanos,
    this_month.people,
    this_month.answers,
    spend.requests,
    spend.cost_nanos,
    page.total
  from page
  left join public.workspaces workspace on workspace.id = page.workspace_id
  left join public.slack_apps app on app.id = page.slack_app_id
  -- Served by the primary key (installation_id, period_start, slack_user_id).
  cross join lateral (
    select count(*)::integer as people, coalesce(sum(person.answers), 0)::bigint as answers
    from public.slack_agent_monthly_people person
    where person.installation_id = page.id
      and person.period_start = p_period_start
  ) this_month
  -- Served by the (workspace_id, bucket_start, ...) unique index. The key is kept
  -- (deleted) after an uninstall, so its spend earlier in the month still counts.
  cross join lateral (
    select coalesce(sum(usage.requests), 0)::bigint as requests, coalesce(sum(usage.cost_nanos), 0)::bigint as cost_nanos
    from public.v2_private_usage_15m usage
    where page.key_id is not null
      and usage.workspace_id = page.workspace_id
      and usage.key_id = page.key_id
      and usage.bucket_start >= p_period_start::timestamp at time zone 'UTC'
      and usage.bucket_start < (p_period_start + interval '1 month') at time zone 'UTC'
  ) spend
  order by page.installed_at desc, page.id desc;
end;
$function$;

COMMENT ON FUNCTION "public"."list_slack_agent_installations"(date, integer, integer) IS 'Every Slack agent installation, newest first, with its Phaseo workspace, the UTC month''s people and pooled answers, and the model requests and spend through its key, summed in the database. For the internal Slack agent page; service role only.';

GRANT EXECUTE ON FUNCTION "public"."list_slack_agent_installations"(date, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_slack_agent_installations"(date, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_slack_agent_installations"(date, integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_slack_agent_installations"(date, integer, integer) FROM PUBLIC, "anon", "authenticated";
