CREATE OR REPLACE FUNCTION public.gateway_realtime_review_admission()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform 1 from public.wallets where workspace_id = new.workspace_id for update;
  if exists (select 1 from public.gateway_realtime_billing_reviews
    where workspace_id = new.workspace_id and access_blocked) then
    raise exception 'realtime_billing_review_required';
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_admission"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_admission"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_admission"() FROM PUBLIC, "anon", "authenticated", "service_role";
