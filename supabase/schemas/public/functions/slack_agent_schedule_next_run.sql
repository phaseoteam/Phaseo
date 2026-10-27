CREATE OR REPLACE FUNCTION public.slack_agent_schedule_next_run (
  p_frequency    text,
  p_hour         integer,
  p_minute       integer,
  p_day_of_week  integer,
  p_day_of_month integer,
  p_timezone     text,
  p_after        timestamp with time zone
)
  RETURNS timestamp with time zone
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
-- When a Slack agent schedule runs next: the first time after p_after that
-- matches it, in local time in p_timezone (an IANA name, as Slack gives it).
-- hourly runs at p_minute past every local hour; daily, weekdays (Monday to
-- Friday), weekly (p_day_of_week, 1 Monday to 7 Sunday) and monthly
-- (p_day_of_month, or the month's last day when it is shorter) at
-- p_hour:p_minute. A local time that a daylight saving change skips or repeats
-- resolves as Postgres resolves it; the result is always later than p_after.
-- Raises 22023 for an unknown time zone or a frequency it doesn't know.
declare
  v_local timestamp := p_after at time zone p_timezone;
  v_time interval := make_interval(hours => coalesce(p_hour, 0), mins => p_minute);
  v_candidate timestamp;
  v_month date;
  v_at timestamptz;
begin
  if p_frequency = 'hourly' then
    v_candidate := date_trunc('hour', v_local) + make_interval(mins => p_minute);
    for step in 0..3 loop
      v_at := (v_candidate + make_interval(hours => step)) at time zone p_timezone;
      if v_at > p_after then
        return v_at;
      end if;
    end loop;
  elsif p_frequency = 'monthly' then
    for step in 0..2 loop
      v_month := (date_trunc('month', v_local) + make_interval(months => step))::date;
      v_candidate := v_month
        + (least(p_day_of_month, extract(day from v_month + interval '1 month' - interval '1 day')::integer) - 1)
        + v_time;
      v_at := v_candidate at time zone p_timezone;
      if v_at > p_after then
        return v_at;
      end if;
    end loop;
  elsif p_frequency in ('daily', 'weekdays', 'weekly') then
    for step in 0..8 loop
      v_candidate := (v_local::date + step) + v_time;
      if p_frequency = 'daily'
        or (p_frequency = 'weekdays' and extract(isodow from v_candidate) between 1 and 5)
        or (p_frequency = 'weekly' and extract(isodow from v_candidate) = p_day_of_week) then
        v_at := v_candidate at time zone p_timezone;
        if v_at > p_after then
          return v_at;
        end if;
      end if;
    end loop;
  end if;
  raise exception 'invalid_schedule' using errcode = '22023';
end;
$function$;

COMMENT ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) IS 'The next time a Slack agent schedule runs after p_after, at its local time in p_timezone. Always later than p_after.';

GRANT EXECUTE ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
