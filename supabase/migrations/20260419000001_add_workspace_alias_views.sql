-- Workspace naming aliases over existing team-backed tables.
-- This keeps current APIs working while exposing workspace terminology in SQL.

drop view if exists public.workspace_members;
drop view if exists public.workspaces;
create view public.workspaces
with (security_invoker = true) as
select * from public.teams;
create view public.workspace_members
with (security_invoker = true) as
select * from public.team_members;
grant select, insert, update, delete on public.workspaces to authenticated, service_role;
grant select, insert, update, delete on public.workspace_members to authenticated, service_role;
comment on view public.workspaces is
  'Workspace alias for public.teams. Uses security_invoker to preserve base-table RLS behavior.';
comment on view public.workspace_members is
  'Workspace membership alias for public.team_members. Uses security_invoker to preserve base-table RLS behavior.';
