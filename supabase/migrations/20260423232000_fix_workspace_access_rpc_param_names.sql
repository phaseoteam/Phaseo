-- Helper access functions are referenced by many RLS policies.
-- On live databases, dropping them to rename an input argument would cascade
-- through policy dependencies, while CREATE OR REPLACE cannot rename input
-- parameters in place. The argument name is not relevant for internal SQL/RLS
-- usage, so keep the existing functions intact and ensure grants remain correct.

do $$
begin
  if to_regprocedure('public.is_workspace_member(uuid)') is not null then
    revoke all on function public.is_workspace_member(uuid) from public;
    grant execute on function public.is_workspace_member(uuid) to authenticated;
  end if;

  if to_regprocedure('public.is_workspace_admin(uuid)') is not null then
    revoke all on function public.is_workspace_admin(uuid) from public;
    grant execute on function public.is_workspace_admin(uuid) to authenticated;
  end if;
end;
$$;
