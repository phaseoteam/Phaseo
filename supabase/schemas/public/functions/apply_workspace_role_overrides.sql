CREATE OR REPLACE FUNCTION public.apply_workspace_role_overrides (
  p_workspace_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare previous_reconcile_setting text;
begin
  -- The SCIM reconcile derives workspace_members.role from access grants alone; a role the owner set as
  -- an override wins over that. The directory-change trigger and every function that suppresses that
  -- trigger for a bulk write call this, so the override is reapplied the same way on every path.
  -- The reconcile flag keeps the manual-grant trigger from saving the override as a manual grant.
  previous_reconcile_setting := current_setting('phaseo.entitlement_reconcile',true);
  perform set_config('phaseo.entitlement_reconcile','on',true);
  update public.workspace_members wm set role=o.access_role::public.workspace_role
  from public.workspace_member_overrides o
  where wm.workspace_id=p_workspace_id and wm.workspace_id=o.workspace_id and wm.user_id=o.user_id and o.access_role is not null
    and lower(wm.role::text) is distinct from o.access_role;
  perform set_config('phaseo.entitlement_reconcile',case when previous_reconcile_setting='on' then 'on' else 'off' end,true);
end;
$function$;

COMMENT ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) IS 'Reapplies owner-set role overrides to workspace_members after a directory reconcile. Shared by the directory-change trigger and the SCIM bulk-write functions.';

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) FROM PUBLIC, "anon", "authenticated";
