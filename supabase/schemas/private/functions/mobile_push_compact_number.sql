CREATE OR REPLACE FUNCTION private.mobile_push_compact_number (
  p_value numeric
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Counts for push text: whole numbers with commas below 100,000 ("12,340"), then "124K",
  -- "18.2M", "124M", "1.2B", with one decimal below 100 of a unit.
  select case
    when n.value < 100000 then to_char(n.value, 'FM999,990')
    when n.value < 999500 then to_char(round(n.value / 1e3), 'FM990') || 'K'
    when n.value < 99950000 then trim_scale(round(n.value / 1e6, 1))::text || 'M'
    when n.value < 999500000 then to_char(round(n.value / 1e6), 'FM990') || 'M'
    when n.value < 99950000000 then trim_scale(round(n.value / 1e9, 1))::text || 'B'
    else to_char(round(n.value / 1e9), 'FM999,999,990') || 'B'
  end
  from (select round(greatest(coalesce(p_value, 0), 0)) as value) n;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_compact_number"(numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_compact_number"(numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_compact_number"(numeric) TO "postgres";
