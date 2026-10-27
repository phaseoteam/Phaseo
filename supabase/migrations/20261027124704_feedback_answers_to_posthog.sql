-- Feedback answers now go to the PostHog survey "90-day feedback email" instead of
-- the database. The row keeps only whether the user answered and their thank-you code.
-- Sending has not been enabled yet, so no answers can have been stored; the guard
-- below aborts the migration rather than drop any that were.
-- phaseo:allow-destructive-migration reason: drops feedback_requests.answers, which the owner asked to remove now that answers go to PostHog (PR #3173); feedback emails were never enabled and the migration aborts if any answer is stored.
SET local check_function_bodies = off;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.feedback_requests WHERE answers IS NOT NULL) THEN
    RAISE EXCEPTION 'feedback_requests.answers holds stored feedback; move it to PostHog before dropping the column';
  END IF;
END
$$;

ALTER TABLE "public"."feedback_requests" DROP CONSTRAINT "feedback_requests_answers_size_check";

ALTER TABLE "public"."feedback_requests" DROP COLUMN "answers";

COMMENT ON TABLE "public"."feedback_requests" IS 'One feedback email per user and campaign. The access token is the unguessable id in the emailed feedback and unsubscribe links. Records whether the user answered and the thank-you credit code; the answers themselves go to the PostHog survey, not here. Rows go with the account.';

DROP FUNCTION public.submit_feedback_response(uuid, jsonb, bigint, integer, integer);

CREATE OR REPLACE FUNCTION public.submit_feedback_response (
  p_token              uuid,
  p_reward_nanos       bigint,
  p_reward_cap         integer,
  p_reward_valid_days  integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records that a feedback token was answered and, while the campaign's reward budget
-- lasts, issues a single-use thank-you credit code. The answers themselves are sent to
-- PostHog by the caller before this runs. Later submissions change nothing and return
-- the original code.
declare
  v_request public.feedback_requests%rowtype;
  v_rewarded integer;
  v_code text;
  v_grant_id uuid;
begin
  select * into v_request
  from public.feedback_requests
  where access_token = p_token
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_request.responded_at is not null then
    return jsonb_build_object('status', 'already_submitted', 'rewardCode', v_request.reward_code);
  end if;

  update public.feedback_requests
  set responded_at = now()
  where id = v_request.id;

  if coalesce(p_reward_nanos, 0) <= 0 or coalesce(p_reward_cap, 0) <= 0 then
    return jsonb_build_object('status', 'submitted', 'rewardStatus', 'none');
  end if;

  -- Serialise rewards per campaign so concurrent submissions cannot overrun the cap.
  perform pg_advisory_xact_lock(hashtextextended('feedback_reward:' || v_request.campaign, 0));

  -- Count the codes themselves: a deleted account takes its feedback row with it, but
  -- the code it was given stays redeemable and still spends the budget.
  select count(*)::integer into v_rewarded
  from public.credit_grants
  where note = 'Feedback thank-you (' || v_request.campaign || ')';

  if v_rewarded >= p_reward_cap then
    return jsonb_build_object('status', 'submitted', 'rewardStatus', 'budget_exhausted');
  end if;

  v_code := 'THANKS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.credit_grants (code, code_normalized, amount_nanos, max_redemptions, expires_at, note)
  values (
    v_code,
    v_code,
    p_reward_nanos,
    1,
    now() + make_interval(days => greatest(coalesce(p_reward_valid_days, 90), 1)),
    'Feedback thank-you (' || v_request.campaign || ')'
  )
  returning id into v_grant_id;

  update public.feedback_requests
  set reward_grant_id = v_grant_id, reward_code = v_code
  where id = v_request.id;

  return jsonb_build_object('status', 'submitted', 'rewardStatus', 'issued', 'rewardCode', v_code);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."submit_feedback_response"(uuid, bigint, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."submit_feedback_response"(uuid, bigint, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_feedback_response"(uuid, bigint, integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."submit_feedback_response"(uuid, bigint, integer, integer) FROM PUBLIC, "anon", "authenticated";

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
