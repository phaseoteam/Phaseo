CREATE OR REPLACE FUNCTION public.record_spend_limit_reached (
  p_workspace_id uuid,
  p_key_id       uuid,
  p_reason       text,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records that the gateway rejected a request because a workspace budget or an API key limit is
-- used up (p_reason is the rejection reason), as one money push per budget or key limit, period
-- and limit value: owners and admins hear that requests are blocked, and for a key limit so does
-- the key's creator. The gateway calls this in the background after responding, at most once
-- per isolate and period, so a blocked workspace that keeps retrying costs one call per isolate.
-- Returns true only the first time; other rejection reasons are ignored.
declare
  v_match text[];
  v_kind text;
  v_window text;
  v_metric text;
  v_limit numeric;
  v_subject text;
  v_name text;
  v_creator uuid;
  v_key_id uuid;
  v_period record;
  v_until text;
  v_title text;
  v_body text;
  v_href text;
  v_inserted uuid;
begin
  if p_workspace_id is null or p_reason is null or p_now is null then
    return false;
  end if;

  v_match := regexp_match(p_reason, '^workspace_(daily|weekly|monthly|lifetime)_cost_budget_reached$');
  if v_match is not null then
    v_kind := 'budget_reached';
    v_window := v_match[1];
    v_metric := 'cost';
    select 'budget:' || b.id, b.limit_nanos into v_subject, v_limit
    from public.workspace_budgets b
    where b.workspace_id = p_workspace_id and b.interval = v_window;
  else
    v_match := regexp_match(p_reason, '^(daily|weekly|monthly)_(request|cost)_limit_reached$');
    if v_match is null or p_key_id is null then
      return false;
    end if;
    v_kind := 'key_limit_reached';
    v_window := v_match[1];
    v_metric := case when v_match[2] = 'request' then 'requests' else 'cost' end;
    select 'key:' || k.id || ':' || v_metric, k.id, k.name, k.created_by,
      case v_window || ':' || v_metric
        when 'daily:requests' then k.daily_limit_requests
        when 'weekly:requests' then k.weekly_limit_requests
        when 'monthly:requests' then k.monthly_limit_requests
        when 'daily:cost' then k.daily_limit_cost_nanos
        when 'weekly:cost' then k.weekly_limit_cost_nanos
        when 'monthly:cost' then k.monthly_limit_cost_nanos
      end
      into v_subject, v_key_id, v_name, v_creator, v_limit
    from public.keys k
    where k.id = p_key_id and k.workspace_id = p_workspace_id;
  end if;
  if v_subject is null or coalesce(v_limit, 0) <= 0 then
    return false;
  end if;

  select * into v_period from private.spend_limit_period(v_window, p_now);
  v_until := case
    when v_window = 'daily' then 'midnight UTC'
    when v_period.reset_at is not null then to_char(v_period.reset_at at time zone 'UTC', 'Mon FMDD')
  end;

  if v_kind = 'budget_reached' then
    v_title := 'Requests blocked by the ' || v_window || ' budget';
    v_body := 'The ' || private.workspace_push_usd(v_limit) || ' ' || v_window || ' budget is used up. '
      || coalesce('Requests resume ' || case when v_window = 'daily' then 'at ' else '' end || v_until || ', or raise the budget.', 'Raise it to resume requests.');
    v_href := '/settings/usage/overview';
  else
    v_title := 'API key ''' || case when char_length(v_name) > 40 then left(v_name, 39) || '…' else v_name end || ''' hit its ' || v_window || ' limit';
    v_body := 'Requests with it are blocked until ' || v_until || '. The limit is ' || private.spend_limit_amount(v_metric, v_limit)
      || ' a ' || case v_window when 'daily' then 'day' when 'weekly' then 'week' else 'month' end || '.';
    v_href := '/settings/keys';
  end if;

  insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, key_id, key_created_by, payload, occurred_at)
  values (
    p_workspace_id,
    v_kind,
    'money',
    v_kind || ':' || v_subject || ':' || v_window || ':' || coalesce(to_char(v_period.period_start at time zone 'UTC', 'YYYY-MM-DD'), 'lifetime') || ':' || v_limit,
    v_key_id,
    v_creator,
    jsonb_build_object(
      'push', jsonb_build_object('title', v_title, 'body', v_body, 'href', v_href, 'lowerLead', v_kind = 'budget_reached'),
      'window', v_window, 'metric', v_metric, 'limit', v_limit, 'reason', p_reason,
      'periodStart', v_period.period_start, 'resetAt', v_period.reset_at
    ),
    p_now
  )
  on conflict (dedupe_key) do nothing
  returning id into v_inserted;

  return v_inserted is not null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_spend_limit_reached"(uuid, uuid, text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_spend_limit_reached"(uuid, uuid, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_spend_limit_reached"(uuid, uuid, text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_spend_limit_reached"(uuid, uuid, text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
