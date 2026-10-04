CREATE OR REPLACE FUNCTION public.refresh_public_model_user_usage_daily (
  p_since timestamp with time zone DEFAULT (now() - '2 days'::interval),
  p_until timestamp with time zone DEFAULT now()
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_since date := (p_since at time zone 'utc')::date;
  v_until date := ((p_until - interval '1 microsecond') at time zone 'utc')::date;
begin
  delete from public.public_model_user_usage_daily
  where day_bucket >= v_since and day_bucket <= v_until;
  insert into public.public_model_user_usage_daily
    (day_bucket, model_id, provider_id, actor_hash, requests, tokens, refreshed_at)
  with normalized as (
    select (fact.occurred_at at time zone 'utc')::date as day_bucket,
      public.public_leaderboard_model_id(
        coalesce(fact.routed_model_slug, fact.requested_model_slug),
        coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input),
        fact.requested_model_input, fact.routed_model_slug, request.api_model_id,
        route.provider_slug, request.pricing_plan, request.is_free_variant
      ) as model_id,
      coalesce(nullif(route.provider_slug, ''), 'unknown') as provider_id,
      coalesce(
        nullif(fact.safe_metadata->>'oauth_user_id', '')::uuid::text,
        nullif(fact.end_user_id, ''), fact.workspace_id::text, fact.key_id::text
      ) as actor_key,
      public.gateway_usage_nonnegative_bigint(coalesce(
        public.gateway_usage_total_tokens(usage.payload), usage.total_tokens, 0
      )) as total_tokens
    from public.v2_request_facts fact
    left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
    left join public.gateway_requests request
      on request.id = fact.gateway_request_id and request.created_at = fact.gateway_request_created_at
    left join lateral (
      select jsonb_object_agg(meter_key, quantity) as payload,
        sum(quantity) filter (where meter_key in ('input_tokens','output_tokens')) as total_tokens
      from (
        select meter.meter_key, sum(meter.quantity) as quantity
        from public.v2_request_usage meter
        where meter.request_event_id = fact.request_event_id
        group by meter.meter_key
      ) meters
    ) usage on true
    where fact.occurred_at >= (v_since::timestamp at time zone 'utc')
      and fact.occurred_at < p_until and fact.success is true
  )
  select day_bucket, model_id, provider_id, md5('public-model-user:' || actor_key),
    count(*)::bigint, sum(total_tokens)::bigint, now()
  from normalized
  where actor_key is not null and model_id is not null and model_id <> ''
    and lower(model_id) not in ('unknown', 'other')
  group by day_bucket, model_id, provider_id, md5('public-model-user:' || actor_key);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_public_model_user_usage_daily"(timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_public_model_user_usage_daily"(timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_public_model_user_usage_daily"(timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_public_model_user_usage_daily"(timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
