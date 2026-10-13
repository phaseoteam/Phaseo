CREATE OR REPLACE FUNCTION public.get_feedback_request (
  p_token uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- What the emailed feedback page needs for one token, or null for an unknown token.
-- Never returns the email address or user id.
select jsonb_build_object(
  'campaign', r.campaign,
  'segment', r.segment,
  'recency', r.recency,
  'responded', r.responded_at is not null,
  'rewardCode', r.reward_code,
  'optedOut', r.opted_out_at is not null or u.product_emails_opted_out_at is not null
)
from public.feedback_requests r
left join public.users u on u.user_id = r.user_id
where r.access_token = p_token;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_feedback_request"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_feedback_request"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_feedback_request"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_feedback_request"(uuid) FROM PUBLIC, "anon", "authenticated";
