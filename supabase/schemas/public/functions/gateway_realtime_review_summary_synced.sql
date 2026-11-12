CREATE OR REPLACE FUNCTION public.gateway_realtime_review_summary_synced (
  p_session_id text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  update public.gateway_realtime_billing_reviews set summary_synced_at = now()
  where session_id = p_session_id and status = 'resolved';
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_summary_synced"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_summary_synced"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_summary_synced"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_summary_synced"(text) FROM PUBLIC, "anon", "authenticated";
