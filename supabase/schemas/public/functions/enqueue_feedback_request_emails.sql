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
