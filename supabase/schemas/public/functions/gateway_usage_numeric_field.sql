CREATE OR REPLACE FUNCTION public.gateway_usage_numeric_field (
  p_usage  jsonb,
  VARIADIC p_keys text[]
)
  RETURNS numeric
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_key text;
  v_part text;
  v_cursor jsonb;
  v_value text;
begin
  if p_usage is null then
    return null;
  end if;

  foreach v_key in array p_keys loop
    v_cursor := p_usage;

    foreach v_part in array string_to_array(v_key, '.') loop
      if v_cursor is null or jsonb_typeof(v_cursor) <> 'object' or not (v_cursor ? v_part) then
        v_cursor := null;
        exit;
      end if;
      v_cursor := v_cursor -> v_part;
    end loop;

    if v_cursor is null then
      continue;
    end if;

    v_value := trim(both '"' from v_cursor::text);
    if v_value ~ '^-?[0-9]+(\.[0-9]+)?$' then
      return v_value::numeric;
    end if;
  end loop;

  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_numeric_field"(jsonb, text[]) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_numeric_field"(jsonb, text[]) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_usage_numeric_field"(jsonb, text[]) IS 'Safely reads the first numeric usage value matching the supplied top-level or dotted JSON key priority list.';

REVOKE ALL ON FUNCTION "public"."gateway_usage_numeric_field"(jsonb, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_numeric_field"(jsonb, text[]) TO "postgres";
