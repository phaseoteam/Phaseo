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
-- Never returns the email address. rewardsIssued lets the caller stop offering a code
-- once the campaign's budget is spent; requestId and userId identify the answer sent
-- to PostHog. The web API keeps those three server-side.
select jsonb_build_object(
  'requestId', r.id,
  'userId', r.user_id,
  'campaign', r.campaign,
  'segment', r.segment,
  'recency', r.recency,
  'responded', r.responded_at is not null,
  'rewardCode', r.reward_code,
  'optedOut', r.opted_out_at is not null or u.product_emails_opted_out_at is not null,
  'rewardsIssued', (
    select count(*)::integer
    from public.credit_grants g
    where g.note = 'Feedback thank-you (' || r.campaign || ')'
  )
)
from public.feedback_requests r
left join public.users u on u.user_id = r.user_id
where r.access_token = p_token;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_feedback_request"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_feedback_request"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_feedback_request"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_feedback_request"(uuid) FROM PUBLIC, "anon", "authenticated";
