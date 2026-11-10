CREATE OR REPLACE FUNCTION public.list_connect_due_charges (
  p_before date,
  p_limit  integer DEFAULT 200
)
  RETURNS TABLE (
    workspace_id uuid,
    period_start date
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Finished UTC months before p_before in which Connect was on for at least a
  -- day and that have no completed charge. Never-tried months come first, then
  -- the longest-waiting retries, so workspaces short of credits cannot starve the rest.
  with months as (
    select distinct period.workspace_id, month.month_start::date as period_start
    from public.connect_subscription_periods period
    cross join lateral generate_series(
      date_trunc('month', period.started_at at time zone 'utc'),
      date_trunc('month', coalesce(period.ended_at, now()) at time zone 'utc'),
      interval '1 month'
    ) as month (month_start)
    where month.month_start < p_before
  )
  select months.workspace_id, months.period_start
  from months
  left join public.connect_charges charge
    on charge.workspace_id = months.workspace_id and charge.period_start = months.period_start
  where coalesce(charge.status, 'pending') = 'pending'
    and private.connect_days_on(months.workspace_id, months.period_start, (months.period_start + interval '1 month')::date) > 0
  order by charge.attempted_at nulls first, months.period_start, months.workspace_id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$function$;

COMMENT ON FUNCTION "public"."list_connect_due_charges"(date, integer) IS 'Each workspace and finished UTC month with at least one Phaseo Connect day that has not been charged yet, for the month-end charge job.';

GRANT EXECUTE ON FUNCTION "public"."list_connect_due_charges"(date, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_connect_due_charges"(date, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_connect_due_charges"(date, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_connect_due_charges"(date, integer) FROM PUBLIC, "anon", "authenticated";
