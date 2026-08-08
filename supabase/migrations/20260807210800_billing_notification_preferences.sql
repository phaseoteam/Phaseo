alter table public.workspace_settings
  add column if not exists auto_top_up_failure_email_enabled boolean not null default true,
  add column if not exists payment_method_expiring_email_enabled boolean not null default true;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null,
  template text not null default 'generic',
  to_email text not null,
  subject text null,
  workspace_id uuid null references public.workspaces(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error text null,
  sent_at timestamptz null
);

alter table public.email_outbox
  add column if not exists dedupe_key text null;

create index if not exists email_outbox_pending_idx
  on public.email_outbox (sent_at, created_at);

create unique index if not exists email_outbox_dedupe_key_unique
  on public.email_outbox (dedupe_key);

alter table public.email_outbox enable row level security;

drop policy if exists email_outbox_select_service on public.email_outbox;
create policy email_outbox_select_service
  on public.email_outbox for select to service_role
  using (true);

drop policy if exists email_outbox_insert_service on public.email_outbox;
create policy email_outbox_insert_service
  on public.email_outbox for insert to service_role
  with check (true);

drop policy if exists email_outbox_update_service on public.email_outbox;
create policy email_outbox_update_service
  on public.email_outbox for update to service_role
  using (true)
  with check (true);

revoke all on public.email_outbox from anon, authenticated;
grant select, insert, update on public.email_outbox to service_role;

comment on column public.workspace_settings.auto_top_up_failure_email_enabled is
  'Email the workspace owner when an automatic credit top-up cannot be completed.';

comment on column public.workspace_settings.payment_method_expiring_email_enabled is
  'Email the workspace owner before a saved card used for billing expires.';

comment on column public.email_outbox.dedupe_key is
  'Stable event identity used to suppress duplicate transactional email delivery.';
