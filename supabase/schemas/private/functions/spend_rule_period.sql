CREATE OR REPLACE FUNCTION private.spend_rule_period (
  p_period    text,
  p_time_zone text,
  p_now       timestamp with time zone
)
  RETURNS TABLE (
    period_start timestamp with time zone,
    period_end   timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The calendar period of a spend rule that contains p_now, in p_time_zone: a day, a week from
  -- Monday, or a month, from local midnight to local midnight. Computed on the local wall clock
  -- and converted back, so a day across a DST change lasts 23 or 25 hours. No row for any
  -- other period (rolling rules have none).
  select
    local.start_at at time zone p_time_zone,
    (local.start_at + case p_period when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end)
      at time zone p_time_zone
  from (
    select date_trunc(case when p_period in ('day', 'week', 'month') then p_period else 'day' end, p_now at time zone p_time_zone) as start_at
  ) local
  where p_period in ('day', 'week', 'month');
$function$;

COMMENT ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) IS 'The day, Monday week or month containing p_now in p_time_zone, as [period_start, period_end). No row for rolling periods.';

REVOKE ALL ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) TO "service_role";
