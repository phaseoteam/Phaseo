-- Add team-level SSO scaffold settings.
alter table public.team_settings
  add column if not exists sso_enabled boolean not null default false;
alter table public.team_settings
  add column if not exists sso_enforced boolean not null default false;
alter table public.team_settings
  add column if not exists sso_mode text not null default 'none';
alter table public.team_settings
  add column if not exists sso_provider_identifier text null;
alter table public.team_settings
  add column if not exists sso_domains text[] not null default '{}';
alter table public.team_settings
  drop constraint if exists team_settings_sso_mode_check;
alter table public.team_settings
  add constraint team_settings_sso_mode_check
  check (sso_mode in ('none', 'saml', 'custom_oidc'));
