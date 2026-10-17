create table if not exists public.mobile_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_model_releases_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null check (char_length(installation_id) between 8 and 200),
  expo_push_token text not null check (expo_push_token ~ '^Expo(nent)?PushToken\\[[A-Za-z0-9_-]+\\]$'),
  platform text not null check (platform in ('android', 'ios')),
  status text not null default 'active' check (status in ('active', 'disabled', 'invalid')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invalidated_at timestamptz,
  unique (user_id, installation_id),
  unique (expo_push_token)
);

create index if not exists mobile_push_devices_user_status_idx
  on public.mobile_push_devices (user_id, status, last_seen_at desc);

create table if not exists public.model_release_push_events (
  id uuid primary key default gen_random_uuid(),
  model_slug text not null references public.v2_models(model_slug) on delete cascade,
  model_name text not null,
  lab_name text not null,
  released_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (model_slug)
);

create index if not exists model_release_push_events_pending_idx
  on public.model_release_push_events (status, next_attempt_at, created_at)
  where status in ('pending', 'processing');

create table if not exists public.model_release_push_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.model_release_push_events(id) on delete cascade,
  device_id uuid not null references public.mobile_push_devices(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  expo_ticket_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (event_id, device_id)
);

create index if not exists model_release_push_attempts_pending_idx
  on public.model_release_push_attempts (event_id, status, created_at)
  where status = 'pending';

alter table public.mobile_notification_preferences enable row level security;
alter table public.mobile_push_devices enable row level security;
alter table public.model_release_push_events enable row level security;
alter table public.model_release_push_attempts enable row level security;

revoke all on table public.mobile_notification_preferences from anon, authenticated;
revoke all on table public.mobile_push_devices from anon, authenticated;
revoke all on table public.model_release_push_events from anon, authenticated;
revoke all on table public.model_release_push_attempts from anon, authenticated;

grant select, insert, update, delete on public.mobile_notification_preferences to service_role;
grant select, insert, update, delete on public.mobile_push_devices to service_role;
grant select, insert, update, delete on public.model_release_push_events to service_role;
grant select, insert, update, delete on public.model_release_push_attempts to service_role;

create or replace function public.enqueue_public_model_release_push()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lab_name text;
  v_was_public boolean;
  v_is_public boolean;
begin
  v_was_public := tg_op = 'UPDATE'
    and old.status = 'active'
    and old.hidden = false
    and coalesce(old.released_at, now()) <= now();
  v_is_public := new.status = 'active'
    and new.hidden = false
    and coalesce(new.released_at, now()) <= now();

  if v_is_public and not v_was_public then
    select name into v_lab_name from public.v2_labs where lab_slug = new.lab_slug;
    insert into public.model_release_push_events (model_slug, model_name, lab_name, released_at)
    values (new.model_slug, new.name, coalesce(v_lab_name, new.lab_slug), new.released_at)
    on conflict (model_slug) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_public_model_release_push() from public, anon, authenticated;
grant execute on function public.enqueue_public_model_release_push() to service_role;

drop trigger if exists enqueue_public_model_release_push on public.v2_models;
create trigger enqueue_public_model_release_push
after insert or update of status, hidden, released_at on public.v2_models
for each row execute function public.enqueue_public_model_release_push();

comment on table public.mobile_notification_preferences is
  'Per-user opt-in preferences for native mobile push notifications.';
comment on table public.mobile_push_devices is
  'Expo push tokens scoped to an authenticated user and app installation.';
comment on table public.model_release_push_events is
  'Deduplicated queue of models becoming publicly available after this feature was deployed.';
comment on table public.model_release_push_attempts is
  'Per-device delivery state for model release push notifications.';
