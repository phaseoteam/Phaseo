-- Prevent ancillary signup side effects from breaking auth.users creation.
-- Supabase reported `Database error saving new user`, which means an auth.users
-- trigger/function raised during signup. This makes the signup trigger best-effort.

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
  begin
    insert into public.users (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  exception when others then
    null;
  end;

  if new.email is not null and new.email <> '' then
    begin
      insert into public.email_outbox (kind, template, to_email, subject, user_id, payload)
      values (
        'welcome',
        'welcome',
        new.email,
        'Welcome to Phaseo',
        new.id,
        jsonb_build_object('user_id', new.id)
      );
    exception when others then
      null;
    end;
  end if;

  begin
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
  exception when others then
    return new;
  end;

  if v_inserted = 1 then
    v_webhook_url := nullif(trim(current_setting('app.settings.discord_signup_webhook_url', true)), '');
    if v_webhook_url is null then
      begin
        update public.signup_discord_notifications
        set last_error = 'discord_signup_webhook_url_not_configured'
        where user_id = new.id;
      exception when others then
        null;
      end;
      return new;
    end if;

    v_created_at := coalesce(new.created_at::text, (now() at time zone 'utc')::text);

    begin
      select net.http_post(
        url := v_webhook_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'content',
          'New Phaseo signup' || E'\n' ||
          '- user_id: `' || new.id::text || '`' || E'\n' ||
          '- email: `' || coalesce(new.email, 'unknown') || '`' || E'\n' ||
          '- created_at: `' || v_created_at || '`',
          'allowed_mentions',
          jsonb_build_object('parse', jsonb_build_array())
        )
      )
      into v_request_id;

      begin
        update public.signup_discord_notifications
        set sent_at = (now() at time zone 'utc'),
            webhook_request_id = v_request_id,
            last_error = null
        where user_id = new.id;
      exception when others then
        null;
      end;
    exception when others then
      begin
        update public.signup_discord_notifications
        set last_error = left(sqlerrm, 2000)
        where user_id = new.id;
      exception when others then
        null;
      end;
    end;
  end if;

  return new;
end;
$$;
