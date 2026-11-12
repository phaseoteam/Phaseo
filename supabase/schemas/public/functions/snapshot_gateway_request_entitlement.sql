CREATE OR REPLACE FUNCTION public.snapshot_gateway_request_entitlement()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare entitlement record; identity_user_id uuid;
begin
  identity_user_id := new.oauth_user_id;
  if identity_user_id is null and new.key_id is not null then
    select oauth_user_id into identity_user_id from public.keys where id=new.key_id;
  end if;
  if identity_user_id is null then return new; end if;
  select e.*,d.name,d.color into entitlement
    from public.workspace_member_effective_entitlements e
    left join public.workspace_departments d on d.id=e.department_id
    where e.workspace_id=new.workspace_id and e.user_id=identity_user_id;
  if entitlement is not null then
    new.attributed_user_id=identity_user_id;
    new.attributed_access_role=entitlement.access_role;
    new.attributed_department_id=entitlement.department_id;
    new.attributed_department_name=entitlement.name;
    new.attributed_department_color=entitlement.color;
    new.attribution_basis=case when new.oauth_user_id is not null then 'oauth_user' else 'oauth_key_user' end;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."snapshot_gateway_request_entitlement"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."snapshot_gateway_request_entitlement"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."snapshot_gateway_request_entitlement"() FROM PUBLIC, "anon", "authenticated", "service_role";
