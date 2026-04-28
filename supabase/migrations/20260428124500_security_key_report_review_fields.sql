-- Review workflow metadata for leaked-key reports.
-- Safe to re-run: every DDL statement is guarded.

alter table if exists public.security_key_reports
  add column if not exists status text not null default 'received',
  add column if not exists token_last_four text null,
  add column if not exists action_taken_at timestamptz null,
  add column if not exists action_taken_by uuid null references public.users(user_id) on delete set null;

create index if not exists security_key_reports_status_received_idx
  on public.security_key_reports (status, received_at desc);
