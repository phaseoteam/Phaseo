-- phaseo:allow-production-history-backfill reason: Restore the already-applied production migration recorded as 20261002204856 so releases can reconcile history.
-- phaseo:allow-destructive-migration reason: Existing reporting refresh replaces only the requested day range; restored verbatim from production migration history.
create or replace function public.refresh_public_model_user_usage_daily(
  p_since timestamp with time zone default (now() - interval '2 days'),
  p_until timestamp with time zone default now()
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_since_date date := date_trunc('day', p_since at time zone 'utc')::date;
  v_until_date date := date_trunc('day', p_until at time zone 'utc')::date;
  v_since_utc timestamptz := (v_since_date::timestamp at time zone 'utc');
begin
  delete from public.public_model_user_usage_daily d
  where d.day_bucket >= v_since_date
    and d.day_bucket <= v_until_date;

  insert into public.public_model_user_usage_daily (
    day_bucket,
    model_id,
    provider_id,
    actor_hash,
    requests,
    tokens,
    refreshed_at
  )
  with normalized as (
    select
      date_trunc('day', gr.created_at at time zone 'utc')::date as day_bucket,
      public.public_leaderboard_model_id(
        gr.canonical_model_id,
        gr.model_id,
        gr.requested_model_id,
        gr.routed_model_id,
        authoritative.api_model_id,
        gr.provider,
        authoritative.pricing_plan,
        authoritative.is_free_variant
      ) as model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      coalesce(
        nullif(to_jsonb(gr)->>'oauth_user_id', ''),
        nullif(to_jsonb(gr)->>'end_user_id', ''),
        nullif(to_jsonb(gr)->>'workspace_id', ''),
        nullif(to_jsonb(gr)->>'team_id', ''),
        nullif(to_jsonb(gr)->>'key_id', '')
      ) as actor_key,
      public.gateway_usage_nonnegative_bigint(
        coalesce(public.gateway_usage_total_tokens(gr.usage), gr.usage_total_tokens, 0)
      ) as total_tokens
    from private.v2_rpc_gateway_requests_compat gr
    left join public.v2_request_facts fact
      on fact.request_event_id = gr.id
    left join public.gateway_requests authoritative
      on authoritative.id = fact.gateway_request_id
     and authoritative.created_at = fact.gateway_request_created_at
    where gr.created_at >= v_since_utc
      and gr.created_at < p_until
      and gr.success is true
  )
  select
    n.day_bucket,
    n.model_id,
    n.provider_id,
    md5('public-model-user:' || n.actor_key) as actor_hash,
    count(*)::bigint as requests,
    sum(n.total_tokens)::bigint as tokens,
    now() as refreshed_at
  from normalized n
  where n.actor_key is not null
    and n.model_id is not null
    and n.model_id <> ''
    and lower(n.model_id) not in ('unknown', 'other')
  group by n.day_bucket, n.model_id, n.provider_id, md5('public-model-user:' || n.actor_key);
end;
$function$;
