CREATE OR REPLACE FUNCTION private.capture_usage_workspace_identity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into private.usage_workspace_identity (workspace_id)
  values (new.id) on conflict do nothing;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."capture_usage_workspace_identity"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."capture_usage_workspace_identity"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."capture_usage_workspace_identity"() TO "postgres";
