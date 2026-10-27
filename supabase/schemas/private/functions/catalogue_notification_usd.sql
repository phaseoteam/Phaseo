CREATE OR REPLACE FUNCTION private.catalogue_notification_usd (
  p_amount numeric
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Plain dollar amounts for notification text: $15, $2.50, $0.28, $0.075.
  select '$' || case
    when p_amount is null then '?'
    when p_amount = trunc(p_amount) then trunc(p_amount)::text
    when round(p_amount, 2) = p_amount then to_char(p_amount, 'FM999999999990.00')
    else trim_scale(round(p_amount, 8))::text
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."catalogue_notification_usd"(numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."catalogue_notification_usd"(numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."catalogue_notification_usd"(numeric) TO "postgres";
