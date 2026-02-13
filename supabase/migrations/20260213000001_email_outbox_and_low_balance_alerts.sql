-- Email outbox + low balance email alert settings
-- - Welcome emails are enqueued on auth.users insert
-- - Low balance alert preferences live on team_settings

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default (now() at time zone 'utc'),
  kind text not null,
  template text not null default 'generic',
  to_email text not null,
  subject text,
  team_id uuid null references public.teams(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error text null,
  sent_at timestamptz null
);

create index if not exists email_outbox_pending_idx
  on public.email_outbox (sent_at, created_at);

-- Team settings: low balance email alerts
alter table public.team_settings
  add column if not exists low_balance_email_enabled boolean not null default false;

alter table public.team_settings
  add column if not exists low_balance_email_threshold_nanos bigint not null default 0;

alter table public.team_settings
  add column if not exists low_balance_email_last_sent_at timestamptz null;

alter table public.team_settings
  add column if not exists low_balance_email_last_sent_balance_nanos bigint null;

-- Enqueue welcome email on signup
create or replace function public.enqueue_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ensure a public profile row exists
  insert into public.users (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- Best-effort enqueue. If email is missing, skip.
  if new.email is not null and new.email <> '' then
    insert into public.email_outbox (kind, template, to_email, subject, user_id, payload)
    values (
      'welcome',
      'welcome',
      new.email,
      'Welcome to AI Stats',
      new.id,
      jsonb_build_object('user_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_enqueue_welcome on auth.users;
create trigger on_auth_user_created_enqueue_welcome
after insert on auth.users
for each row
execute function public.enqueue_welcome_email();

