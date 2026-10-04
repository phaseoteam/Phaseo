CREATE OR REPLACE FUNCTION public.refresh_workspace_enterprise_member_overage (
  p_workspace_id uuid
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_period_start date;
  v_included_members integer;
  v_monthly_unique_members bigint;
  v_overage_count bigint;
begin
  select subscription.included_members,
         coalesce(subscription.current_period_start::date, pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'UTC')::date)
  into v_included_members, v_period_start
  from public.workspace_addon_subscriptions subscription
  where subscription.workspace_id = p_workspace_id
    and subscription.addon_key = 'identity'
    and subscription.included_members >= 100000
    and (
      subscription.status in ('active', 'trialing')
      or (subscription.status = 'past_due' and subscription.grace_until > pg_catalog.now())
    );

  if v_included_members is null then return 0; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('enterprise-member-overage:' || p_workspace_id::text || ':' || v_period_start::text, 0)
  );

  insert into public.workspace_enterprise_member_overages (workspace_id, period_start, user_id)
  select member.workspace_id, v_period_start, member.user_id
  from public.workspace_members member
  where member.workspace_id = p_workspace_id
  on conflict do nothing;

  select pg_catalog.count(*) into v_monthly_unique_members
  from public.workspace_enterprise_member_overages usage
  where usage.workspace_id = p_workspace_id and usage.period_start = v_period_start;

  v_overage_count := greatest(v_monthly_unique_members - v_included_members, 0);

  insert into public.workspace_addon_usage_monthly as usage_monthly (
    workspace_id, addon_key, metric_key, period_start, quantity, updated_at
  ) values (
    p_workspace_id, 'identity', 'member_overage', v_period_start, v_overage_count, pg_catalog.now()
  ) on conflict (workspace_id, addon_key, metric_key, period_start) do update set
    quantity = greatest(usage_monthly.quantity, excluded.quantity),
    updated_at = excluded.updated_at;

  return v_overage_count;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_workspace_enterprise_member_overage"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_workspace_enterprise_member_overage"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_workspace_enterprise_member_overage"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_workspace_enterprise_member_overage"(uuid) FROM PUBLIC, "anon", "authenticated";
