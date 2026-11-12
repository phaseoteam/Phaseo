SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.gateway_spend_limit_seed (
  p_workspace_id        uuid,
  p_key_ids             uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  -- Windows and filters must stay identical to the key-limit accounting in
  -- public.gateway_fetch_request_context_without_workspace_budget.
  now_utc     timestamptz := (now() at time zone 'utc');
  day_start   timestamptz := date_trunc('day',  now_utc);
  week_start  timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start timestamptz := date_trunc('month', now_utc);
  v_key_ids   uuid[] := coalesce(p_key_ids, '{}'::uuid[]);
  v_exclude   text[] := coalesce(p_exclude_request_ids, '{}'::text[]);
  v_keys      jsonb;
  v_excluded  jsonb := '[]'::jsonb;
begin
  if p_workspace_id is null then
    raise exception using errcode = '22023', message = 'workspace_id_required';
  end if;
  if cardinality(v_key_ids) > 100 then
    raise exception using errcode = '22023', message = 'too_many_key_ids';
  end if;
  if cardinality(v_exclude) > 5000 then
    raise exception using errcode = '22023', message = 'too_many_excluded_request_ids';
  end if;

  with key_rows as (
    select
      k.id,
      k.status,
      coalesce(k.soft_blocked, false) as soft_blocked,
      k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
      k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos,
      -- Unlimited keys need no history read, as in the context function.
      coalesce(greatest(k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
        k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos) > 0, false) as limited
    from public.keys k
    where k.id = any(v_key_ids)
      and k.workspace_id = p_workspace_id
  ), usage as (
    select
      gr.key_id,
      count(*) filter (where gr.created_at >= day_start)                                  as used_day_reqs,
      count(*) filter (where gr.created_at >= week_start)                                 as used_wk_reqs,
      count(*) filter (where gr.created_at >= month_start)                                as used_mo_reqs,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= day_start), 0)::bigint   as used_day_cost,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= week_start), 0)::bigint  as used_wk_cost,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= month_start), 0)::bigint as used_mo_cost
    from public.gateway_requests gr
    where gr.key_id = any(array(select key_rows.id from key_rows where key_rows.limited))
      and gr.workspace_id = p_workspace_id
      and gr.success is true
      and gr.created_at >= least(week_start, month_start)
      and not (gr.request_id = any(v_exclude))
    group by gr.key_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key_id', key_rows.id,
    'active', key_rows.status = 'active',
    'soft_blocked', key_rows.soft_blocked,
    'limited', key_rows.limited,
    'limits', jsonb_build_object(
      'daily',   jsonb_build_object('requests', key_rows.daily_limit_requests,   'cost_nanos', key_rows.daily_limit_cost_nanos),
      'weekly',  jsonb_build_object('requests', key_rows.weekly_limit_requests,  'cost_nanos', key_rows.weekly_limit_cost_nanos),
      'monthly', jsonb_build_object('requests', key_rows.monthly_limit_requests, 'cost_nanos', key_rows.monthly_limit_cost_nanos)
    ),
    'used', case when key_rows.limited then jsonb_build_object(
      'daily',   jsonb_build_object('requests', coalesce(usage.used_day_reqs, 0), 'cost_nanos', coalesce(usage.used_day_cost, 0)),
      'weekly',  jsonb_build_object('requests', coalesce(usage.used_wk_reqs, 0),  'cost_nanos', coalesce(usage.used_wk_cost, 0)),
      'monthly', jsonb_build_object('requests', coalesce(usage.used_mo_reqs, 0),  'cost_nanos', coalesce(usage.used_mo_cost, 0))
    ) else null end
  ) order by key_rows.id), '[]'::jsonb)
  into v_keys
  from key_rows
  left join usage on usage.key_id = key_rows.id;

  -- Excluded requests that are already persisted, so the caller can stop
  -- tracking them separately and count the stored row instead.
  if cardinality(v_exclude) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'request_id', gr.request_id,
      'key_id', gr.key_id,
      'success', gr.success,
      'cost_nanos', coalesce(gr.cost_nanos, 0),
      'created_at', gr.created_at
    ) order by gr.request_id, gr.created_at), '[]'::jsonb)
    into v_excluded
    from public.gateway_requests gr
    where gr.workspace_id = p_workspace_id
      and gr.request_id = any(v_exclude)
      and gr.created_at >= least(week_start, month_start) - interval '1 day';
  end if;

  return jsonb_build_object(
    'now', to_jsonb(now_utc),
    'day_start', to_jsonb(day_start),
    'week_start', to_jsonb(week_start),
    'month_start', to_jsonb(month_start),
    'keys', v_keys,
    'budget_status', public.gateway_workspace_budget_status(p_workspace_id, 0),
    'excluded_rows', v_excluded
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) IS 'Seeds the gateway spend-limit coordinator: per-key day/week/month usage with the request-context windows and filters (excluding already-recorded request ids), plus workspace budget status.';

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) FROM PUBLIC, "anon", "authenticated";
