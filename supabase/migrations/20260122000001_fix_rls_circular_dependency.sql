-- Fix circular RLS dependency by making is_workspace_member function bypass RLS
-- Without SECURITY DEFINER, the function cannot query workspace_members because
-- workspace_members itself requires is_workspace_member() to pass, creating infinite recursion

-- Recreate the function with SECURITY DEFINER (no need to drop, CREATE OR REPLACE handles it)
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer  -- This allows the function to bypass RLS
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members tm
    where tm.workspace_id = p_workspace_id
      and tm.user_id = auth.uid()
  );
$$;
-- Grant execute permission to authenticated users
grant execute on function public.is_workspace_member(uuid) to authenticated;
