CREATE OR REPLACE FUNCTION public.capture_manual_workspace_grant()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if current_setting('phaseo.entitlement_reconcile', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.workspace_access_grants
    where workspace_id = old.workspace_id
      and user_id = old.user_id
      and source_type = 'manual';

    perform public.reconcile_scim_entitlements(old.workspace_id);
    return old;
  end if;

  insert into public.workspace_access_grants(
    workspace_id,
    user_id,
    source_type,
    source_id,
    access_role
  )
  values (
    new.workspace_id,
    new.user_id,
    'manual',
    new.user_id,
    lower(new.role::text)
  )
  on conflict (workspace_id, user_id, source_type, source_id)
  do update set
    access_role = excluded.access_role,
    updated_at = now();

  perform public.reconcile_scim_entitlements(new.workspace_id);
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."capture_manual_workspace_grant"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."capture_manual_workspace_grant"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."capture_manual_workspace_grant"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."capture_manual_workspace_grant"() FROM PUBLIC, "anon", "authenticated";
