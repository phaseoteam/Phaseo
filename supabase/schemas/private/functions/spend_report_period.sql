CREATE OR REPLACE FUNCTION private.spend_report_period (
  p_cadence   text,
  p_time_zone text,
  p_now       timestamp with time zone
)
  RETURNS TABLE (
    due            boolean,
    period_start   timestamp with time zone,
    period_end     timestamp with time zone,
    previous_start timestamp with time zone,
    previous_end   timestamp with time zone,
    due_from       timestamp with time zone,
    due_until      timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The last complete spend report period before p_now in p_time_zone, and the period before it
  -- (for the change): the day before (daily), the Monday-to-Sunday ISO week before (weekly) or the
  -- calendar month before (monthly), local midnight to local midnight. The current period comes
  -- from private.spend_rule_period, the spend rules' calendar, so a DST change makes a day 23 or 25
  -- hours long here too. The report is due from 09:00 local time on the first day of the current
  -- period until 21:00, so a late or missed run still sends it that day; outside that window the
  -- period is not due. No row for 'off' or anything else.
  select
    p_now >= due.due_from and p_now < due.due_until,
    (local.current_start - cadence.unit) at time zone p_time_zone,
    current_period.period_start,
    (local.current_start - cadence.unit - cadence.unit) at time zone p_time_zone,
    (local.current_start - cadence.unit) at time zone p_time_zone,
    due.due_from,
    due.due_until
  from (
    select
      case p_cadence when 'daily' then 'day' when 'weekly' then 'week' when 'monthly' then 'month' end as calendar,
      case p_cadence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' end as unit
  ) cadence
  cross join lateral private.spend_rule_period(cadence.calendar, p_time_zone, p_now) current_period
  cross join lateral (select current_period.period_start at time zone p_time_zone as current_start) local
  cross join lateral (
    select
      (local.current_start + interval '9 hours') at time zone p_time_zone as due_from,
      (local.current_start + interval '21 hours') at time zone p_time_zone as due_until
  ) due
  where cadence.calendar is not null;
$function$;

COMMENT ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) IS 'The last complete daily, weekly (ISO, Monday) or monthly spend report period before p_now in p_time_zone, the period before it, and whether the report is due (09:00 to 21:00 local time on the first day after the period).';

REVOKE ALL ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) TO "service_role";
