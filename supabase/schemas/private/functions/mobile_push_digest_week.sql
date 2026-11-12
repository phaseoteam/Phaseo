CREATE OR REPLACE FUNCTION private.mobile_push_digest_week (
  p_time_zone text,
  p_now       timestamp with time zone
)
  RETURNS TABLE (
    due         boolean,
    iso_week    text,
    week_start  timestamp with time zone,
    week_cutoff timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Where p_now falls for the weekly digest in p_time_zone. The digest is due from 18:00 on
  -- Sunday until 06:00 on Monday, local time, so a late or missed run still sends it that
  -- evening or night. It covers the ISO week from Monday 00:00 up to that Sunday 18:00. Moving
  -- the clock on six hours turns the window into the first twelve hours of the next ISO week.
  select
    shifted.local_time < monday.next_start + interval '12 hours',
    to_char(monday.next_start - interval '7 days', 'IYYY-"W"IW'),
    (monday.next_start - interval '7 days') at time zone p_time_zone,
    (monday.next_start - interval '6 hours') at time zone p_time_zone
  from (select (p_now at time zone p_time_zone) + interval '6 hours' as local_time) shifted
  cross join lateral (select date_trunc('week', shifted.local_time) as next_start) monday;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_week"(text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_week"(text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_digest_week"(text, timestamp with time zone) TO "postgres";
