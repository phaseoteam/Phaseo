-- The original low-balance migration shared a version with an existing
-- production migration, so Supabase recorded the version without applying
-- these workspace settings columns. Re-issue the idempotent schema change
-- under a unique migration version.

alter table public.workspace_settings
  add column if not exists low_balance_email_enabled boolean not null default false,
  add column if not exists low_balance_email_threshold_nanos bigint not null default 0,
  add column if not exists low_balance_email_last_sent_at timestamptz null,
  add column if not exists low_balance_email_last_sent_balance_nanos bigint null;

alter table public.workspace_settings
  drop constraint if exists workspace_settings_low_balance_threshold_nonnegative;

alter table public.workspace_settings
  add constraint workspace_settings_low_balance_threshold_nonnegative
  check (low_balance_email_threshold_nanos >= 0);
