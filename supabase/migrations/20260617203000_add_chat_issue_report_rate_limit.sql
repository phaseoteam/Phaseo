create table if not exists public.chat_issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issue_fingerprint text not null,
  model_id text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists chat_issue_reports_user_created_at_idx
  on public.chat_issue_reports (user_id, created_at desc);

alter table public.chat_issue_reports enable row level security;

revoke all on table public.chat_issue_reports from anon, authenticated;

create or replace function public.reserve_chat_issue_report(
  p_issue_fingerprint text,
  p_model_id text default null,
  p_request_id text default null
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_hour_limit integer := 3;
  v_day_limit integer := 10;
  v_hour_count integer := 0;
  v_day_count integer := 0;
  v_window_start timestamptz;
begin
  if v_user_id is null then
    return query select false, 0, null::integer;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  delete from public.chat_issue_reports
  where created_at < v_now - interval '30 days';

  select count(*)::integer
  into v_hour_count
  from public.chat_issue_reports
  where user_id = v_user_id
    and created_at >= v_now - interval '1 hour';

  if v_hour_count >= v_hour_limit then
    select min(created_at)
    into v_window_start
    from public.chat_issue_reports
    where user_id = v_user_id
      and created_at >= v_now - interval '1 hour';

    return query select
      false,
      0,
      greatest(
        60,
        ceil(extract(epoch from (v_window_start + interval '1 hour' - v_now)))::integer
      );
    return;
  end if;

  select count(*)::integer
  into v_day_count
  from public.chat_issue_reports
  where user_id = v_user_id
    and created_at >= v_now - interval '1 day';

  if v_day_count >= v_day_limit then
    select min(created_at)
    into v_window_start
    from public.chat_issue_reports
    where user_id = v_user_id
      and created_at >= v_now - interval '1 day';

    return query select
      false,
      0,
      greatest(
        60,
        ceil(extract(epoch from (v_window_start + interval '1 day' - v_now)))::integer
      );
    return;
  end if;

  insert into public.chat_issue_reports (
    user_id,
    issue_fingerprint,
    model_id,
    request_id
  )
  values (
    v_user_id,
    left(coalesce(nullif(p_issue_fingerprint, ''), 'unknown'), 500),
    nullif(p_model_id, ''),
    nullif(p_request_id, '')
  );

  return query select
    true,
    greatest(least(v_hour_limit - v_hour_count - 1, v_day_limit - v_day_count - 1), 0),
    null::integer;
end;
$$;

revoke all on function public.reserve_chat_issue_report(text, text, text) from public;
grant execute on function public.reserve_chat_issue_report(text, text, text) to authenticated;
