-- Signup Discord webhook notifications (Supabase -> Discord direct):
-- - send directly from auth.users trigger
-- - keep idempotency by tracking one notification row per user_id
-- - read webhook URL from DB setting: app.settings.discord_signup_webhook_url

create extension if not exists pg_net;

create table if not exists public.signup_discord_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default (now() at time zone 'utc'),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text null,
  payload jsonb not null default '{}'::jsonb,
  webhook_request_id bigint null,
  sent_at timestamptz null,
  last_error text null
);

create unique index if not exists signup_discord_notifications_user_id_uidx
  on public.signup_discord_notifications (user_id);

alter table public.signup_discord_notifications enable row level security;
revoke all on public.signup_discord_notifications from anon, authenticated;
grant select, insert, update on public.signup_discord_notifications to service_role;

create or replace function public.enqueue_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_webhook_url text;
  v_request_id bigint;
  v_created_at text;
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

  -- Idempotent signup record (one row per user).
  insert into public.signup_discord_notifications (user_id, email, payload)
  values (
    new.id,
    new.email,
    jsonb_build_object(
      'user_id', new.id,
      'email', new.email,
      'auth_created_at', new.created_at
    )
  )
  on conflict (user_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- Only send if this is the first time we inserted the signup row.
  if v_inserted = 1 then
    v_webhook_url := nullif(trim(current_setting('app.settings.discord_signup_webhook_url', true)), '');
    if v_webhook_url is null then
      update public.signup_discord_notifications
      set last_error = 'discord_signup_webhook_url_not_configured'
      where user_id = new.id;
      return new;
    end if;

    v_created_at := coalesce(new.created_at::text, (now() at time zone 'utc')::text);

    begin
      select net.http_post(
        url := v_webhook_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'content',
          'New AI Stats signup' || E'\n' ||
          '- user_id: `' || new.id::text || '`' || E'\n' ||
          '- email: `' || coalesce(new.email, 'unknown') || '`' || E'\n' ||
          '- created_at: `' || v_created_at || '`',
          'allowed_mentions',
          jsonb_build_object('parse', jsonb_build_array())
        )
      )
      into v_request_id;

      update public.signup_discord_notifications
      set sent_at = (now() at time zone 'utc'),
          webhook_request_id = v_request_id,
          last_error = null
      where user_id = new.id;
    exception when others then
      update public.signup_discord_notifications
      set last_error = left(sqlerrm, 2000)
      where user_id = new.id;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_enqueue_welcome on auth.users;
create trigger on_auth_user_created_enqueue_welcome
after insert on auth.users
for each row
execute function public.enqueue_welcome_email();
