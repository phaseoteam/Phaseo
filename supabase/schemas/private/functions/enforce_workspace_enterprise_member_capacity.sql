CREATE OR REPLACE FUNCTION private.enforce_workspace_enterprise_member_capacity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_member_limit integer;
  v_member_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('enterprise-member-limit:' || new.workspace_id::text, 0)
  );

  if exists (
    select 1 from public.workspace_members member
    where member.workspace_id = new.workspace_id and member.user_id = new.user_id
  ) then return new; end if;

  select subscription.included_members into v_member_limit
  from public.workspace_addon_subscriptions subscription
  where subscription.workspace_id = new.workspace_id
    and subscription.addon_key = 'identity'
    and subscription.included_members < 100000
    and (
      subscription.status in ('active', 'trialing')
      or (subscription.status = 'past_due' and subscription.grace_until > pg_catalog.now())
    );

  if v_member_limit is null then return new; end if;

  select pg_catalog.count(*) into v_member_count
  from public.workspace_members member where member.workspace_id = new.workspace_id;

  if v_member_count >= v_member_limit then
    raise exception using errcode = '23514', message = 'workspace_enterprise_member_limit_reached';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."enforce_workspace_enterprise_member_capacity"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enforce_workspace_enterprise_member_capacity"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enforce_workspace_enterprise_member_capacity"() TO "postgres";
