CREATE OR REPLACE FUNCTION private.spend_limit_amount (
  p_metric text,
  p_value  numeric
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- An amount counted against a budget or key limit: dollars for cost ($80.00, from nanos),
  -- otherwise a request count (1,000 requests).
  select case
    when p_metric = 'cost' then private.workspace_push_usd(p_value)
    else to_char(p_value, 'FM999,999,999,990') || case when p_value = 1 then ' request' else ' requests' end
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."spend_limit_amount"(text, numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_limit_amount"(text, numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_limit_amount"(text, numeric) TO "postgres";
