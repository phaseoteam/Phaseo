-- Provider status is a capability of an organisation workspace, not a workspace persona.

alter table public.provider_onboarding_submissions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.provider_onboarding_submissions submission
set workspace_id = link.workspace_id
from public.provider_account_links link
where submission.workspace_id is null
  and link.provider_slug = submission.provider_slug
  and link.status in ('pending', 'active');

create index if not exists provider_onboarding_submissions_workspace_idx
  on public.provider_onboarding_submissions (workspace_id, created_at desc);

update public.workspaces
set workspace_kind = 'organization'
where workspace_kind = 'provider';

alter table public.workspaces
  drop constraint if exists workspaces_workspace_kind_check,
  add constraint workspaces_workspace_kind_check
    check (workspace_kind in ('personal', 'organization', 'enterprise'));

create or replace function public.set_workspace_kind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(new.tier, '')) = 'enterprise' then
    new.workspace_kind := 'enterprise';
  elsif lower(coalesce(new.name, '')) = 'personal' then
    new.workspace_kind := 'personal';
  elsif tg_op = 'INSERT' or new.workspace_kind in ('personal', 'enterprise') then
    new.workspace_kind := 'organization';
  end if;
  return new;
end;
$$;

comment on table public.provider_account_links is
  'Optional provider capability and ownership attached to an organisation workspace.';

comment on column public.provider_onboarding_submissions.workspace_id is
  'Organisation workspace that owns this provider submission.';
