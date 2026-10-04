CREATE OR REPLACE FUNCTION public.gateway_validate_pricing_time_windows (
  value jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select
    jsonb_typeof(value) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(value) as item(window_value)
      where
        jsonb_typeof(item.window_value) is distinct from 'object'
        or jsonb_typeof(item.window_value->'label') is distinct from 'string'
        or btrim(item.window_value->>'label') = ''
        or item.window_value->>'timezone' is distinct from 'UTC'
        or coalesce(item.window_value->>'start_time', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(item.window_value->>'end_time', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        or item.window_value->>'start_time' = item.window_value->>'end_time'
        or (
          item.window_value ? 'price_per_unit'
          and case jsonb_typeof(item.window_value->'price_per_unit')
            when 'null' then false
            when 'number' then (item.window_value->>'price_per_unit')::numeric < 0
            when 'string' then
              case
                when btrim(item.window_value->>'price_per_unit') !~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$' then true
                else (btrim(item.window_value->>'price_per_unit'))::numeric < 0
              end
            else true
          end
        )
        or (
          item.window_value ? 'priority'
          and case jsonb_typeof(item.window_value->'priority')
            when 'null' then false
            when 'number' then ((item.window_value->>'priority')::numeric % 1) <> 0
            else true
          end
        )
    );
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_validate_pricing_time_windows"(jsonb) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."gateway_validate_pricing_time_windows"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_validate_pricing_time_windows"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_validate_pricing_time_windows"(jsonb) TO "postgres";
