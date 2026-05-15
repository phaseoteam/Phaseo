-- Fix circular RLS dependency by making is_team_member function bypass RLS
-- Without SECURITY DEFINER, the function cannot query team_members because
-- team_members itself requires is_team_member() to pass, creating infinite recursion

-- Recreate the function with SECURITY DEFINER (no need to drop, CREATE OR REPLACE handles it)
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer  -- This allows the function to bypass RLS
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
  );
$$;
-- Grant execute permission to authenticated users
grant execute on function public.is_team_member(uuid) to authenticated;
