SET local check_function_bodies = off;

-- Phaseo Slack agent: what each installation spent on models through its managed key, per UTC month, summed in the database for the settings page.

CREATE OR REPLACE FUNCTION public.get_slack_agent_model_spend (
  p_workspace_id uuid,
  p_periods      date[]
)
  RETURNS TABLE (
    installation_id uuid,
    period_start    date,
    requests        bigint,
    cost_nanos      bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
-- What each of a workspace's Slack agent installations spent on models through
-- its managed key, per UTC month, for up to 12 months given as their first days.
-- Summed here from the 15-minute rollup so the settings page never adds up rows.
-- These are normal requests billed from credits, not part of the agent's own
-- monthly charge. Uninstalling deletes the key but keeps key_id, so past months
-- still count. A month without spend has no row. Service role only: the account
-- route checks the caller is an owner or admin first.
begin
  if p_workspace_id is null or p_periods is null then
    raise exception 'invalid_periods' using errcode = '22023';
  end if;
  if cardinality(p_periods) > 12 then
    raise exception 'too_many_periods' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_periods) as given(period_start)
    where given.period_start is null or extract(day from given.period_start) <> 1
  ) then
    raise exception 'invalid_periods' using errcode = '22023';
  end if;

  return query
  select installation.id,
    period.period_start,
    sum(usage.requests)::bigint,
    sum(usage.cost_nanos)::bigint
  from public.slack_installations installation
  cross join (select distinct given.period_start from unnest(p_periods) as given(period_start)) period
  -- Served by the (workspace_id, bucket_start, ...) unique index, one month at a time.
  join public.v2_private_usage_15m usage
    on usage.workspace_id = p_workspace_id
    and usage.bucket_start >= period.period_start::timestamp at time zone 'UTC'
    and usage.bucket_start < (period.period_start + interval '1 month') at time zone 'UTC'
    and usage.key_id = installation.key_id
  where installation.workspace_id = p_workspace_id
    and installation.key_id is not null
  group by installation.id, period.period_start
  order by period.period_start desc, installation.id;
end;
$function$;

COMMENT ON FUNCTION "public"."get_slack_agent_model_spend"(uuid, date[]) IS 'Model spend and requests through each Slack agent installation''s managed key, per UTC month for up to 12 given months, summed in the database from v2_private_usage_15m. Billed from credits as normal requests, separately from the Slack agent charge. For the settings page; service role only.';

GRANT EXECUTE ON FUNCTION "public"."get_slack_agent_model_spend"(uuid, date[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_slack_agent_model_spend"(uuid, date[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_slack_agent_model_spend"(uuid, date[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_slack_agent_model_spend"(uuid, date[]) FROM PUBLIC, "anon", "authenticated";
