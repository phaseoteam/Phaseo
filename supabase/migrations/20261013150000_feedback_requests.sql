-- Feedback request emails: a per-user opt-out from non-essential email, one request row
-- per user and campaign, and the functions that queue requests, read and answer them,
-- issue the capped thank-you credit, and unsubscribe. Nothing calls them until the
-- gateway job is enabled.
SET local check_function_bodies = off;

ALTER TABLE "public"."users" ADD COLUMN "product_emails_opted_out_at" timestamp with time zone;

COMMENT ON COLUMN "public"."users"."product_emails_opted_out_at" IS 'When the user unsubscribed from non-essential email such as feedback requests. Service and billing email is unaffected.';

CREATE TABLE "public"."feedback_requests" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "campaign"        text                     NOT NULL,
  "access_token"    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "segment"         text                     NOT NULL,
  "recency"         text                     NOT NULL,
  "requested_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "responded_at"    timestamp with time zone,
  "answers"         jsonb,
  "reward_grant_id" uuid,
  "reward_code"     text,
  "opted_out_at"    timestamp with time zone,
  CONSTRAINT "feedback_requests_answers_size_check" CHECK (((answers IS NULL) OR (octet_length((answers)::text) <= 20000))),
  CONSTRAINT "feedback_requests_campaign_check" CHECK ((campaign ~ '^[a-z0-9_-]{1,64}$'::text)),
  CONSTRAINT "feedback_requests_recency_check" CHECK ((recency = ANY (ARRAY['active'::text, 'lapsed'::text, 'dormant'::text]))),
  CONSTRAINT "feedback_requests_segment_check" CHECK ((segment = ANY (ARRAY['never_requested'::text, 'used_not_paid'::text, 'paid'::text]))),
  CONSTRAINT "feedback_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "feedback_requests_reward_grant_id_fkey" FOREIGN KEY (reward_grant_id) REFERENCES public.credit_grants(id) ON DELETE SET NULL,
  CONSTRAINT "feedback_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."feedback_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX feedback_requests_access_token_key ON public.feedback_requests USING btree (access_token);

CREATE INDEX feedback_requests_campaign_rewarded_idx ON public.feedback_requests USING btree (campaign)
  WHERE (reward_grant_id IS NOT NULL);

CREATE UNIQUE INDEX feedback_requests_user_campaign_key ON public.feedback_requests USING btree (user_id, campaign);

CREATE POLICY "deny_direct_client_access" ON "public"."feedback_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."feedback_requests" IS 'One feedback email per user and campaign. The access token is the unguessable id in the emailed feedback and unsubscribe links; answers and the thank-you credit code are stored here. Rows go with the account.';

REVOKE ALL ON TABLE "public"."feedback_requests" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."feedback_requests" TO "service_role";

REVOKE ALL ON TABLE "public"."feedback_requests" FROM "anon", "authenticated";
CREATE OR REPLACE FUNCTION public.enqueue_feedback_request_emails (
  p_campaign              text,
  p_min_account_age_days  integer,
  p_limit                 integer
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Queues at most p_limit feedback emails, oldest accounts first, for users who signed
-- up at least p_min_account_age_days ago and have not been asked in this campaign.
-- The segment picks the email's question and the recency its opening line.
declare
  v_queued integer;
begin
  if p_limit is null or p_limit <= 0 then
    return 0;
  end if;

  with candidates as (
    select
      a.id as user_id,
      lower(trim(a.email)) as email,
      a.last_sign_in_at,
      nullif(split_part(trim(coalesce(
        nullif(trim(u.display_name), ''),
        a.raw_user_meta_data ->> 'full_name',
        a.raw_user_meta_data ->> 'name',
        ''
      )), ' ', 1), '') as first_name
    from public.users u
    join auth.users a on a.id = u.user_id
    where a.created_at <= now() - make_interval(days => greatest(coalesce(p_min_account_age_days, 0), 0))
      and nullif(trim(a.email), '') is not null
      and a.deleted_at is null
      and not coalesce(a.is_anonymous, false)
      and u.role::text <> 'admin'
      and u.product_emails_opted_out_at is null
      and not exists (
        select 1 from public.feedback_requests r
        where r.user_id = a.id and r.campaign = p_campaign
      )
    order by a.created_at asc
    limit p_limit
  ),
  segmented as (
    select
      c.*,
      case
        when exists (
          select 1
          from public.workspace_members wm
          join public.credit_ledger cl on cl.workspace_id = wm.workspace_id
          where wm.user_id = c.user_id and cl.ref_type = 'Stripe_Payment_Intent'
        ) then 'paid'
        when exists (
          select 1
          from public.workspace_members wm
          join public.v2_private_usage_daily d on d.workspace_id = wm.workspace_id
          where wm.user_id = c.user_id
        ) or exists (
          select 1
          from public.workspace_members wm
          join public.gateway_requests g on g.workspace_id = wm.workspace_id
          where wm.user_id = c.user_id
        ) then 'used_not_paid'
        else 'never_requested'
      end as segment,
      case
        when c.last_sign_in_at >= now() - interval '30 days' then 'active'
        when c.last_sign_in_at >= now() - interval '180 days' then 'lapsed'
        else 'dormant'
      end as recency
    from candidates c
  ),
  requested as (
    insert into public.feedback_requests (user_id, campaign, segment, recency)
    select s.user_id, p_campaign, s.segment, s.recency
    from segmented s
    on conflict (user_id, campaign) do nothing
    returning user_id, access_token, segment, recency
  ),
  queued as (
    insert into public.email_outbox (kind, template, to_email, user_id, payload, dedupe_key)
    select
      'feedback_request',
      'feedback_request',
      s.email,
      r.user_id,
      jsonb_build_object(
        'campaign', p_campaign,
        'token', r.access_token,
        'segment', r.segment,
        'recency', r.recency,
        'first_name', s.first_name
      ),
      'feedback_request:' || p_campaign || ':' || r.user_id
    from requested r
    join segmented s on s.user_id = r.user_id
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::integer into v_queued from queued;

  return v_queued;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enqueue_feedback_request_emails"(text, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_feedback_request_emails"(text, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_feedback_request_emails"(text, integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_feedback_request_emails"(text, integer, integer) FROM PUBLIC, "anon", "authenticated";
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
CREATE OR REPLACE FUNCTION public.opt_out_of_product_emails (
  p_token uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- One-click unsubscribe from a feedback email: opts the user out of all non-essential
-- email and cancels any of their feedback emails still waiting in the outbox.
-- Repeating it is harmless. Returns false for an unknown token.
declare
  v_user_id uuid;
begin
  update public.feedback_requests
  set opted_out_at = coalesce(opted_out_at, now())
  where access_token = p_token
  returning user_id into v_user_id;

  if v_user_id is null then
    return false;
  end if;

  update public.users
  set product_emails_opted_out_at = coalesce(product_emails_opted_out_at, now())
  where user_id = v_user_id;

  update public.email_outbox
  set attempts = 5, last_error = 'unsubscribed'
  where user_id = v_user_id and kind = 'feedback_request' and sent_at is null;

  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."opt_out_of_product_emails"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."opt_out_of_product_emails"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."opt_out_of_product_emails"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."opt_out_of_product_emails"(uuid) FROM PUBLIC, "anon", "authenticated";
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
