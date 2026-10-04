CREATE OR REPLACE FUNCTION public.gateway_realtime_review_lifecycle()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.status = 'billing_unresolved' then
    insert into public.gateway_realtime_billing_reviews (session_id, workspace_id, evidence_usage, evidence_metadata)
    values (new.session_id, new.workspace_id, new.usage, new.metadata) on conflict do nothing;
    if old.usage is distinct from new.usage or old.metadata is distinct from new.metadata then
      update public.gateway_realtime_billing_reviews set confirmed_cost_nanos = null,
        evidence_complete = false, version = version + 1, retry_after = now()
      where session_id = new.session_id and status = 'open';
    end if;
  elsif new.status in ('completed', 'failed', 'cancelled', 'expired') then
    insert into public.gateway_realtime_billing_decisions
      (session_id, workspace_id, action, reason, review_version, cost_nanos)
    select session_id, workspace_id, 'settled', coalesce(new.disconnect_reason, 'server_settlement'),
      version, new.final_cost_nanos
    from public.gateway_realtime_billing_reviews where session_id = new.session_id and status = 'open';
    update public.gateway_realtime_billing_reviews set status = 'resolved', resolved_at = now(), version = version + 1
    where session_id = new.session_id and status = 'open';
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_lifecycle"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_lifecycle"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_lifecycle"() FROM PUBLIC, "anon", "authenticated", "service_role";
