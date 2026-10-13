CREATE OR REPLACE FUNCTION public.submit_feedback_response (
  p_token              uuid,
  p_answers            jsonb,
  p_reward_nanos       bigint,
  p_reward_cap         integer,
  p_reward_valid_days  integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Stores the first answer for a feedback token and, while the campaign's reward budget
-- lasts, issues a single-use thank-you credit code. Later submissions change nothing
-- and return the original code.
declare
  v_request public.feedback_requests%rowtype;
  v_rewarded integer;
  v_code text;
  v_grant_id uuid;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('status', 'invalid_answers');
  end if;

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
  set responded_at = now(), answers = p_answers
  where id = v_request.id;

  if coalesce(p_reward_nanos, 0) <= 0 or coalesce(p_reward_cap, 0) <= 0 then
    return jsonb_build_object('status', 'submitted', 'rewardStatus', 'none');
  end if;

  -- Serialise rewards per campaign so concurrent submissions cannot overrun the cap.
  perform pg_advisory_xact_lock(hashtextextended('feedback_reward:' || v_request.campaign, 0));

  select count(*)::integer into v_rewarded
  from public.feedback_requests
  where campaign = v_request.campaign and reward_grant_id is not null;

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

GRANT EXECUTE ON FUNCTION "public"."submit_feedback_response"(uuid, jsonb, bigint, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."submit_feedback_response"(uuid, jsonb, bigint, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_feedback_response"(uuid, jsonb, bigint, integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."submit_feedback_response"(uuid, jsonb, bigint, integer, integer) FROM PUBLIC, "anon", "authenticated";
