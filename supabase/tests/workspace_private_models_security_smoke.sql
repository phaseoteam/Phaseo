begin;

do $$
declare
  rls_enabled boolean;
  anon_privileges integer;
  authenticated_privileges integer;
begin
  select c.relrowsecurity
    into rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'workspace_private_models';

  if rls_enabled is distinct from true then
    raise exception 'workspace_private_models must have RLS enabled';
  end if;

  select count(*) into anon_privileges
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'workspace_private_models'
    and grantee = 'anon';

  select count(*) into authenticated_privileges
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'workspace_private_models'
    and grantee = 'authenticated';

  if anon_privileges <> 0 or authenticated_privileges <> 0 then
    raise exception 'private model records must not be granted to anon or authenticated';
  end if;

  if not has_table_privilege('service_role', 'public.workspace_private_models', 'select,insert,update,delete') then
    raise exception 'service_role requires private model table access';
  end if;
end $$;

rollback;
