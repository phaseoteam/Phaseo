-- Ensure alpha channel can only be enabled when beta channel is enabled.
update public.workspace_settings
set alpha_channel_enabled = false
where alpha_channel_enabled = true
  and beta_channel_enabled = false;

alter table public.workspace_settings
  drop constraint if exists workspace_settings_alpha_requires_beta_channel_check;

alter table public.workspace_settings
  add constraint workspace_settings_alpha_requires_beta_channel_check
  check (
    alpha_channel_enabled = false
    or beta_channel_enabled = true
  );
