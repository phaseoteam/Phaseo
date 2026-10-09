create function public.get_public_period_leaderboard(
  p_metric text default 'text_tokens',
  p_days integer default 7,
  p_as_of timestamptz default now()
)
returns table (model_id text, current numeric, previous numeric)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_days is null or p_days not in (1, 7, 30) or p_as_of is null
    or p_metric is null or p_metric not in (
      'text_tokens', 'image_inputs', 'image_outputs', 'audio_tokens', 'audio_seconds',
      'speech_seconds', 'transcription_seconds', 'video_tokens', 'video_seconds',
      'cached_tokens', 'embedding_tokens', 'rerank_quad_tokens', 'tool_calls', 'users'
    ) then
    raise exception 'Invalid ranking metric or period';
  end if;

  return query
  with periods as (
    select true as is_current, p_as_of - p_days * interval '24 hours' as start_at, p_as_of as end_at
    union all
    select false, p_as_of - 2 * p_days * interval '24 hours', p_as_of - p_days * interval '24 hours'
  ), windows as (
    select p.*,
      (p.start_at at time zone 'UTC')::date + case
        when (p.start_at at time zone 'UTC')::time = time '00:00' then 0 else 1 end as full_from,
      (p.end_at at time zone 'UTC')::date as full_to
    from periods p
  ), edges as materialized (
    select w.is_current, w.start_at, least(w.full_from::timestamp at time zone 'UTC', w.end_at) as end_at
    from windows w where w.start_at < (w.full_from::timestamp at time zone 'UTC')
    union all
    select w.is_current, greatest(w.full_to::timestamp at time zone 'UTC', w.start_at), w.end_at
    from windows w where (w.full_to::timestamp at time zone 'UTC') < w.end_at
  ), quantities as (
    select w.is_current, u.model_id, case when p_metric = 'tool_calls' then u.tool_call_count::numeric
      else public.public_ranking_metric_value(p_metric, u.meters) end as value
    from windows w
    cross join lateral public.get_public_ranking_usage_window(w.start_at, w.end_at) u
    where p_metric <> 'users'
  ), actors as (
    select w.is_current, d.model_id, d.actor_hash
    from windows w
    join public.reporting_model_user_usage_daily d on d.day_bucket >= w.full_from and d.day_bucket < w.full_to
    where p_metric = 'users'
    union all
    -- Match the actor identity and model normalization used by the daily user rollup.
    select e.is_current,
      public.public_leaderboard_model_id(
        coalesce(fact.routed_model_slug, fact.requested_model_slug),
        coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input),
        fact.requested_model_input, fact.routed_model_slug, authoritative.api_model_id,
        route.provider_slug, authoritative.pricing_plan, authoritative.is_free_variant),
      md5('public-model-user:' || coalesce(
        nullif(fact.safe_metadata->>'oauth_user_id', '')::uuid::text,
        nullif(fact.end_user_id, ''), fact.workspace_id::text, fact.key_id::text
      ))
    from edges e
    join public.reporting_request_facts fact on fact.occurred_at >= e.start_at and fact.occurred_at < e.end_at
    left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
    left join public.gateway_requests authoritative on authoritative.id = fact.gateway_request_id
      and authoritative.created_at = fact.gateway_request_created_at
    where p_metric = 'users' and fact.success is true
  ), totals as (
    select q.model_id, coalesce(sum(q.value) filter (where q.is_current), 0) as current,
      coalesce(sum(q.value) filter (where not q.is_current), 0) as previous
    from quantities q group by q.model_id
    union all
    select a.model_id, count(distinct a.actor_hash) filter (where a.is_current)::numeric,
      count(distinct a.actor_hash) filter (where not a.is_current)::numeric
    from actors a group by a.model_id
  )
  select t.model_id, t.current, t.previous
  from totals t
  join public.v2_models m on m.model_slug = t.model_id and m.hidden = false and m.status <> 'disabled'
  where lower(t.model_id) not in ('unknown', 'other') and (t.current > 0 or t.previous > 0)
  order by t.current desc, t.model_id
  limit 500;
end;
$$;
revoke all on function public.get_public_period_leaderboard(text, integer, timestamptz) from public;
grant execute on function public.get_public_period_leaderboard(text, integer, timestamptz) to service_role;
