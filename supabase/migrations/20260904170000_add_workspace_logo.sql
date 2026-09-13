alter table public.workspaces
  add column if not exists logo_url text;

alter table public.workspaces
  add constraint workspaces_logo_url_safe
  check (
    logo_url is null
    or logo_url ~ '^https://'
    or logo_url ~ '^/api/_web/profile-avatars/workspaces/'
  );

comment on column public.workspaces.logo_url is
  'Workspace-managed logo displayed on private catalogue resources and workspace surfaces.';
