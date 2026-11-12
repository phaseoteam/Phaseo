CREATE OR REPLACE FUNCTION private.mobile_push_group_key (
  p_kind          text,
  p_lab_slug      text,
  p_provider_slug text,
  p_model_slug    text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Pushes for one device that share a key and are due together are sent as one: a lab's
  -- releases and models reaching Phaseo, a provider newly serving several models, or repeated
  -- price changes to one model. Other kinds are always sent alone.
  select case
    when p_kind in ('model_released', 'gateway_available') and p_lab_slug is not null then 'release:' || p_lab_slug
    when p_kind = 'provider_added' and p_provider_slug is not null then 'provider:' || p_provider_slug
    when p_kind = 'price_changed' and p_model_slug is not null then 'price:' || p_model_slug
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_group_key"(text, text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_group_key"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_group_key"(text, text, text, text) TO "postgres";
