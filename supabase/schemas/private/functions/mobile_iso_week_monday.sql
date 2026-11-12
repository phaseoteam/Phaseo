CREATE OR REPLACE FUNCTION private.mobile_iso_week_monday (
  p_week text
)
  RETURNS date
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- The Monday that starts ISO week p_week, written "2026-W43", or null when there is no such
  -- week (a malformed value, or week 53 of a year with 52).
  select case when candidate.monday is not null and to_char(candidate.monday, 'IYYY-"W"IW') = p_week then candidate.monday end
  from (
    select case
      when p_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' and left(p_week, 4) >= '1000' then
        make_date(left(p_week, 4)::integer, 1, 4)
          - (extract(isodow from make_date(left(p_week, 4)::integer, 1, 4))::integer - 1)
          + (right(p_week, 2)::integer - 1) * 7
    end as monday
  ) candidate;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_iso_week_monday"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_iso_week_monday"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_iso_week_monday"(text) TO "postgres";
