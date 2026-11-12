CREATE OR REPLACE FUNCTION private.seed_workspace_enterprise_member_overages()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_period_start date := coalesce(new.current_period_start::date, pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'UTC')::date);
  v_monthly_unique_members bigint;
  v_overage_count bigint;
begin
  if new.addon_key <> 'identity'
     or new.included_members < 100000
     or not (
       new.status in ('active', 'trialing')
       or (new.status = 'past_due' and new.grace_until > pg_catalog.now())
     ) then
    return new;
  end if;

  insert into public.workspace_enterprise_member_overages (workspace_id, period_start, user_id)
  select member.workspace_id, v_period_start, member.user_id
  from public.workspace_members member
  where member.workspace_id = new.workspace_id
  on conflict do nothing;

  select pg_catalog.count(*) into v_monthly_unique_members
  from public.workspace_enterprise_member_overages usage
  where usage.workspace_id = new.workspace_id and usage.period_start = v_period_start;

  v_overage_count := greatest(v_monthly_unique_members - new.included_members, 0);

  insert into public.workspace_addon_usage_monthly as usage_monthly (
    workspace_id, addon_key, metric_key, period_start, quantity, updated_at
  ) values (
    new.workspace_id, 'identity', 'member_overage', v_period_start, v_overage_count, pg_catalog.now()
  )
  on conflict (workspace_id, addon_key, metric_key, period_start) do update set
    quantity = greatest(usage_monthly.quantity, excluded.quantity),
    updated_at = excluded.updated_at;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."seed_workspace_enterprise_member_overages"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."seed_workspace_enterprise_member_overages"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."seed_workspace_enterprise_member_overages"() TO "postgres";
