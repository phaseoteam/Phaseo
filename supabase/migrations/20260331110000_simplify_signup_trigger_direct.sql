-- Simplify auth signup side effects:
-- - Keep signup durable by requiring public.users upsert.
-- - Remove welcome email outbox enqueue from signup trigger.
-- - Send Discord signup webhook directly (best-effort, no tracking table).
--
-- Verification/welcome-style auth email is expected to be handled by Supabase Auth settings.

create extension if not exists pg_net;
create or replace function public.enqueue_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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

  -- Mandatory: if this fails, abort signup.
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

    raise warning '[signup-trigger] stage=% status=error severity=mandatory user_id=% sqlstate=% message=% detail=%',
      v_stage,
      new.id,
      coalesce(v_error_sqlstate, ''),
      coalesce(v_error_message, sqlerrm),
      coalesce(v_error_detail, '');

    raise;
  end;

  -- Optional: direct Discord notify for each new auth user.
  v_stage := 'discord_webhook_url_resolve';
  v_webhook_url := nullif(trim(current_setting('app.settings.discord_signup_webhook_url', true)), '');
  if v_webhook_url is null then
    raise log '[signup-trigger] stage=% status=skip reason=discord_signup_webhook_url_not_configured user_id=%',
      v_stage,
      new.id;
    return new;
  end if;

  v_created_at := coalesce(new.created_at::text, (now() at time zone 'utc')::text);

  v_stage := 'discord_webhook_request';
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

    raise log '[signup-trigger] stage=% status=ok user_id=% request_id=%', v_stage, new.id, v_request_id;
  exception when others then
    get stacked diagnostics
      v_error_message = message_text,
      v_error_sqlstate = returned_sqlstate,
      v_error_detail = pg_exception_detail;

    raise warning '[signup-trigger] stage=% status=error severity=optional user_id=% sqlstate=% message=% detail=%',
      v_stage,
      new.id,
      coalesce(v_error_sqlstate, ''),
      coalesce(v_error_message, sqlerrm),
      coalesce(v_error_detail, '');
  end;

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

  raise;
end;
$$;
drop trigger if exists on_auth_user_created_enqueue_welcome on auth.users;
create trigger on_auth_user_created_enqueue_welcome
after insert on auth.users
for each row
execute function public.enqueue_welcome_email();
