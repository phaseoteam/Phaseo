-- Ensure alpha channel can only be enabled when beta channel is enabled.
update public.team_settings
set alpha_channel_enabled = false
where alpha_channel_enabled = true
  and beta_channel_enabled = false;
alter table public.team_settings
  drop constraint if exists team_settings_alpha_requires_beta_channel_check;
alter table public.team_settings
  add constraint team_settings_alpha_requires_beta_channel_check
  check (
    alpha_channel_enabled = false
    or beta_channel_enabled = true
  );
