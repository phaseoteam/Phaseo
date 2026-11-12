CREATE OR REPLACE FUNCTION private.spend_limit_period (
  p_window       text,
  p_now          timestamp with time zone,
  OUT period_start timestamp with time zone,
  OUT reset_at     timestamp with time zone
)
  RETURNS record
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- The UTC period a budget or API key limit counts over at p_now, as the gateway counts it: a
  -- day, a week from Monday, a calendar month, or all time (lifetime, with no start or reset).
  select start_utc at time zone 'UTC',
    (start_utc + case p_window when 'daily' then interval '1 day' when 'weekly' then interval '1 week' else interval '1 month' end) at time zone 'UTC'
  from (
    select case p_window
      when 'daily' then date_trunc('day', p_now at time zone 'UTC')
      when 'weekly' then date_trunc('week', p_now at time zone 'UTC')
      when 'monthly' then date_trunc('month', p_now at time zone 'UTC')
    end as start_utc
  ) period;
$function$;

REVOKE ALL ON FUNCTION "private"."spend_limit_period"(text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_limit_period"(text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_limit_period"(text, timestamp with time zone) TO "postgres";
