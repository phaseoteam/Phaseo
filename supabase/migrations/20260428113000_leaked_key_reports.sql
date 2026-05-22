-- Public leaked-key report intake + revocation metadata.
-- Safe to re-run: every DDL statement is guarded.

alter table if exists public.keys
  add column if not exists revoked_at timestamptz null,
  add column if not exists revoked_reason text null;
alter table if exists public.management_keys
  add column if not exists revoked_at timestamptz null,
  add column if not exists revoked_reason text null;
create table if not exists public.security_key_reports (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default (now() at time zone 'utc'),
  source text null,
  reporter_email text null,
  evidence_url text null,
  comment text null,
  token_prefix text null,
  token_fingerprint text null,
  matched boolean not null default false,
  key_table text null,
  api_key_id uuid null,
  workspace_id uuid null references public.workspaces(id) on delete set null,
  action_taken text null,
  report_mode text null,
  ip_hash text null,
  user_agent_hash text null
);
create index if not exists security_key_reports_received_at_idx
  on public.security_key_reports (received_at desc);
create index if not exists security_key_reports_token_fingerprint_idx
  on public.security_key_reports (token_fingerprint);
create index if not exists security_key_reports_workspace_id_idx
  on public.security_key_reports (workspace_id);
create index if not exists security_key_reports_matched_idx
  on public.security_key_reports (matched, received_at desc);
