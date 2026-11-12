CREATE OR REPLACE FUNCTION private.is_valid_time_zone (
  p_time_zone text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Names from the server's IANA database. The posix/ and right/ trees and the server-local
  -- aliases are not zones a user picks. Case-sensitive, as browsers report them.
  select p_time_zone is not null
    and pg_catalog.char_length(p_time_zone) between 1 and 64
    and p_time_zone !~ '^(posix|right)/'
    and p_time_zone not in ('posixrules', 'localtime', 'Factory')
    and exists (
      select 1
      from pg_catalog.pg_timezone_names zone
      where zone.name = p_time_zone
    );
$function$;

COMMENT ON FUNCTION "private"."is_valid_time_zone"(text) IS 'True when the text is an IANA time zone name the server knows (pg_timezone_names), excluding the posix/ and right/ trees and server-local aliases. Used by spend rule and billing time zone validation.';

REVOKE ALL ON FUNCTION "private"."is_valid_time_zone"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_valid_time_zone"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."is_valid_time_zone"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."is_valid_time_zone"(text) TO "service_role";
