CREATE OR REPLACE FUNCTION private.enforce_workspace_enterprise_subscription_capacity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('enterprise-member-limit:' || new.workspace_id::text, 0)
  );
  if new.addon_key = 'identity' and new.included_members < 100000
    and (new.status in ('active', 'trialing')
      or (new.status = 'past_due' and new.grace_until > pg_catalog.now()))
    and (select pg_catalog.count(*) from public.workspace_members member
      where member.workspace_id = new.workspace_id) > new.included_members then
    raise exception using errcode = '23514', message = 'workspace_enterprise_member_limit_reached';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.enforce_workspace_enterprise_subscription_capacity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.enforce_workspace_enterprise_subscription_capacity() TO postgres;
