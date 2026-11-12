CREATE OR REPLACE FUNCTION public.set_workspace_kind()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if new.workspace_kind = 'provider' then return new; end if;
  if lower(coalesce(new.tier, '')) = 'enterprise' then
    new.workspace_kind := 'enterprise';
  elsif lower(coalesce(new.name, '')) = 'personal' then
    new.workspace_kind := 'personal';
  elsif tg_op = 'INSERT' or new.workspace_kind in ('personal', 'enterprise') then
    new.workspace_kind := 'organization';
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_workspace_kind"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_workspace_kind"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_workspace_kind"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_workspace_kind"() FROM PUBLIC, "anon", "authenticated";
