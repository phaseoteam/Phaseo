-- Replace signup trigger diagnostics table logging with lightweight server logs.
-- Logs are emitted via RAISE so they appear in Supabase Postgres logs only.

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
  v_stage text := 'start';
  v_error_message text;
  v_error_sqlstate text;
  v_error_detail text;
begin
  raise log '[signup-trigger] stage=start status=ok user_id=% email=%',
    new.id,
    coalesce(new.email, '');

  v_stage := 'public_users_upsert';
  begin
    insert into public.users (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    raise log '[signup-trigger] stage=% status=ok user_id=%', v_stage, new.id;
  exception when others then
    get stacked diagnostics
      v_error_message = message_text,
      v_error_sqlstate = returned_sqlstate,
      v_error_detail = pg_exception_detail;

    raise warning '[signup-trigger] stage=% status=error user_id=% sqlstate=% message=% detail=%',
      v_stage,
      new.id,
      coalesce(v_error_sqlstate, ''),
      coalesce(v_error_message, sqlerrm),
      coalesce(v_error_detail, '');
  end;

  v_stage := 'email_outbox_insert';
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

      raise log '[signup-trigger] stage=% status=ok user_id=%', v_stage, new.id;
    exception when others then
      get stacked diagnostics
        v_error_message = message_text,
        v_error_sqlstate = returned_sqlstate,
        v_error_detail = pg_exception_detail;

      raise warning '[signup-trigger] stage=% status=error user_id=% sqlstate=% message=% detail=%',
        v_stage,
        new.id,
        coalesce(v_error_sqlstate, ''),
        coalesce(v_error_message, sqlerrm),
        coalesce(v_error_detail, '');
    end;
  else
    raise log '[signup-trigger] stage=% status=skip reason=missing_email user_id=%', v_stage, new.id;
  end if;

  v_stage := 'signup_discord_notification_insert';
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

    raise log '[signup-trigger] stage=% status=ok user_id=% inserted_rows=%', v_stage, new.id, v_inserted;
  exception when others then
    get stacked diagnostics
      v_error_message = message_text,
      v_error_sqlstate = returned_sqlstate,
      v_error_detail = pg_exception_detail;

    raise warning '[signup-trigger] stage=% status=error user_id=% sqlstate=% message=% detail=%',
      v_stage,
      new.id,
      coalesce(v_error_sqlstate, ''),
      coalesce(v_error_message, sqlerrm),
      coalesce(v_error_detail, '');

    return new;
  end;

  if v_inserted = 1 then
    v_stage := 'discord_webhook_url_resolve';
    v_webhook_url := nullif(trim(current_setting('app.settings.discord_signup_webhook_url', true)), '');
    if v_webhook_url is null then
      begin
        update public.signup_discord_notifications
        set last_error = 'discord_signup_webhook_url_not_configured'
        where user_id = new.id;
      exception when others then
        null;
      end;

      raise log '[signup-trigger] stage=% status=skip reason=discord_signup_webhook_url_not_configured user_id=%',
        v_stage,
        new.id;
      return new;
    end if;

    raise log '[signup-trigger] stage=% status=ok user_id=%', v_stage, new.id;

    v_created_at := coalesce(new.created_at::text, (now() at time zone 'utc')::text);

    v_stage := 'discord_webhook_request';
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

      raise log '[signup-trigger] stage=% status=ok user_id=% request_id=%', v_stage, new.id, v_request_id;
    exception when others then
      get stacked diagnostics
        v_error_message = message_text,
        v_error_sqlstate = returned_sqlstate,
        v_error_detail = pg_exception_detail;

      begin
        update public.signup_discord_notifications
        set last_error = left(coalesce(v_error_message, sqlerrm), 2000)
        where user_id = new.id;
      exception when others then
        null;
      end;

      raise warning '[signup-trigger] stage=% status=error user_id=% sqlstate=% message=% detail=%',
        v_stage,
        new.id,
        coalesce(v_error_sqlstate, ''),
        coalesce(v_error_message, sqlerrm),
        coalesce(v_error_detail, '');
    end;
  else
    raise log '[signup-trigger] stage=discord_webhook_request status=skip reason=notification_already_exists user_id=%',
      new.id;
  end if;

  return new;
exception when others then
  get stacked diagnostics
    v_error_message = message_text,
    v_error_sqlstate = returned_sqlstate,
    v_error_detail = pg_exception_detail;

  raise warning '[signup-trigger] stage=% status=fatal user_id=% sqlstate=% message=% detail=%',
    coalesce(v_stage, 'unknown'),
    new.id,
    coalesce(v_error_sqlstate, ''),
    coalesce(v_error_message, sqlerrm),
    coalesce(v_error_detail, '');

  return new;
end;
$$;
drop function if exists public.log_auth_signup_trigger_event(uuid, text, text, text, text, text, jsonb);
drop table if exists public.auth_signup_trigger_log;
