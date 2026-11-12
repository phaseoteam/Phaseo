CREATE OR REPLACE FUNCTION public.gateway_realtime_review_admission()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform 1 from public.wallets where workspace_id = new.workspace_id for update;
  -- Only the API key whose session is under review is blocked, not the workspace.
  if exists (select 1 from public.gateway_realtime_billing_reviews
    where workspace_id = new.workspace_id and access_blocked
      and key_id is not distinct from new.key_id) then
    raise exception 'realtime_billing_review_required';
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_admission"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_admission"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_admission"() FROM PUBLIC, "anon", "authenticated", "service_role";
