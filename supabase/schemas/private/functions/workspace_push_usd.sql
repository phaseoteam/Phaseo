CREATE OR REPLACE FUNCTION private.workspace_push_usd (
  p_nanos numeric
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Dollars in US format for workspace push text: $3.20, $1,250.00. Null stays null.
  select '$' || to_char(round(p_nanos / 1000000000, 2), 'FM999,999,999,990.00');
$function$;

REVOKE ALL ON FUNCTION "private"."workspace_push_usd"(numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."workspace_push_usd"(numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_push_usd"(numeric) TO "postgres";
