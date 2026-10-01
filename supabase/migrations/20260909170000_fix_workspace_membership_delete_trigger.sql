-- phaseo:allow-destructive-migration reason: Records an already-applied trigger fix; DELETE only removes the deleted membership's manual access grants during normal cleanup.
-- Ensure auth-user deletion can cascade through workspace membership cleanup.
-- The trigger may run as Supabase's auth deletion role, which does not have
-- direct table privileges on the entitlement tables.

create or replace function public.capture_manual_workspace_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.capture_manual_workspace_grant() from public, anon, authenticated;
grant execute on function public.capture_manual_workspace_grant() to service_role;
