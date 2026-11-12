CREATE OR REPLACE FUNCTION public.valid_key_ip_allowlist (
  entries jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'pg_catalog'
  AS $function$
declare
  entry jsonb;
  address text;
begin
  if entries is null or jsonb_typeof(entries) <> 'array' then return false; end if;
  if jsonb_array_length(entries) > 100 then return false; end if;
  for entry in select value from jsonb_array_elements(entries) loop
    if jsonb_typeof(entry) <> 'object'
      or jsonb_typeof(entry->'label') is distinct from 'string'
      or jsonb_typeof(entry->'address') is distinct from 'string'
      or length(btrim(entry->>'label')) not between 1 and 100
    then return false; end if;
    address := entry->>'address';
    -- Require full dotted IPv4 or IPv6, with an optional prefix length.
    if address !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,3})?$'
      and address !~ '^[0-9A-Fa-f:.]+:[0-9A-Fa-f:.]*(/[0-9]{1,3})?$'
    then return false; end if;
    perform address::inet;
  end loop;
  return true;
exception when invalid_text_representation then return false;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."valid_key_ip_allowlist"(jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."valid_key_ip_allowlist"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."valid_key_ip_allowlist"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."valid_key_ip_allowlist"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."valid_key_ip_allowlist"(jsonb) FROM PUBLIC, "anon";
