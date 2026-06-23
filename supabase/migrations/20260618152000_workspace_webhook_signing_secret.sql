alter table public.workspace_settings
  add column if not exists webhook_signing_secret text,
  add column if not exists webhook_signing_secret_prefix text,
  add column if not exists webhook_signing_secret_created_at timestamptz,
  add column if not exists webhook_signing_secret_rotated_at timestamptz;

