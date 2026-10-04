CREATE OR REPLACE FUNCTION private.invalidate_routing_catalogue()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update private.routing_catalogue_revision set revision=revision+1 where singleton;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."invalidate_routing_catalogue"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."invalidate_routing_catalogue"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."invalidate_routing_catalogue"() TO "postgres";
