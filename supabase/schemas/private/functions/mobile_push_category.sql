CREATE OR REPLACE FUNCTION private.mobile_push_category (
  p_kind text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- The category of a catalogue push: the key users switch off in
  -- mobile_notification_preferences.categories, and the Android channel from channel scheme 2.
  select case
    when p_kind in ('model_released', 'gateway_available') then 'new-models'
    when p_kind in ('price_changed', 'provider_added', 'provider_launched') then 'prices-providers'
    when p_kind = 'deprecation_announced' then 'deprecations'
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_category"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_category"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_category"(text) TO "postgres";
