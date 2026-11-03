-- Security review 2026-11-03: MFA could be bypassed through the Data API.
-- The website and web-api require an aal2 session from anyone with a verified second factor, but no
-- RLS policy checked it. With only the password, an attacker could sign in through the Auth API with
-- the public anon key, get an aal1 token, and call /rest/v1 directly as the account owner: invite
-- themselves, change keys, management keys and BYOK keys, delete workspaces.
--
-- Supabase's documented fix: a RESTRICTIVE policy for the authenticated role on every table that
-- signed-in users can read or write, requiring an aal2 session when the user has a verified factor.
-- Users without MFA are unaffected. anon (public catalogue reads) and service_role are unaffected, as
-- the policies only apply to authenticated. Tables that already deny anon and authenticated, and the
-- public catalogue tables (readable by anon anyway, not writable by signed-in users), are left alone.

CREATE OR REPLACE FUNCTION public.mfa_satisfied ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = auth.uid()
        and f.status = 'verified'
    );
$function$;

COMMENT ON FUNCTION "public"."mfa_satisfied"() IS 'True when the signed-in session has passed MFA (aal2), or the user has no verified second factor. Restrictive RLS policies use it so a password-only session of an MFA-protected account cannot use the Data API.';

REVOKE ALL ON FUNCTION "public"."mfa_satisfied"() FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."mfa_satisfied"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."mfa_satisfied"() TO "service_role";

CREATE POLICY "mfa_required_when_enrolled" ON "public"."api_apps"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."broadcast_destination_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."broadcast_destination_rule_groups"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."broadcast_destination_rules"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."byok_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."credit_grant_redemptions"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."credit_grants"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."credit_ledger"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_async_operations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_batch_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_dynamic_route_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_dynamic_route_versions"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_dynamic_routes"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_feedback"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_observability_events"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_preset_test_run_items"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_wallet_reservations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_webhook_endpoints"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."key_guardrails"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."management_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."oauth_app_metadata"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."oauth_authorizations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."presets"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."users"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_credit_ledger"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_credit_reservations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_private_usage_daily"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_artifacts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_facts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_feedback"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_pricing_lines"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_routing_decisions"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_routing_traces"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_usage"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."wallets"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_broadcast_destinations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_budgets"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_department_budgets"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_guardrails"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_invites"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_join_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_member_guardrails"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_settings"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_spend_blocks"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_spend_rule_destinations"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_spend_rule_state"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_spend_rules"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspaces"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

-- SECURITY DEFINER functions bypass RLS, so the restrictive policies above do not cover what signed-in
-- users can do through them. Every one that reads or changes workspace data for the caller now refuses
-- a password-only session of an MFA-protected account. service_role has no auth.uid(), so
-- mfa_satisfied() is true there and server-side calls are unchanged. get_workspace_key_usage is a SQL
-- function, so it returns no rows instead, like an RLS read.

CREATE OR REPLACE FUNCTION public.approve_workspace_join_request (
  p_request_id uuid
)
  RETURNS TABLE (
    id                uuid,
    workspace_id      uuid,
    requester_user_id uuid,
    invite_id         uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_req public.workspace_join_requests%rowtype;
  v_role public.workspace_role := 'member'::public.workspace_role;
begin
  if not public.mfa_satisfied() then
    raise exception using errcode = '42501', message = 'mfa_required';
  end if;

  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized';
  end if;

  select *
    into v_req
  from public.workspace_join_requests
  where workspace_join_requests.id = p_request_id
    and public.is_workspace_admin(workspace_join_requests.workspace_id)
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Join request not found or not authorized';
  end if;

  if v_req.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;

  if not public.is_workspace_admin(v_req.workspace_id) then
    raise exception using errcode = '42501', message = 'Only owners or admins may approve join requests.';
  end if;

  if v_req.invite_id is not null then
    update public.workspace_invites ti
      set uses_count = coalesce(ti.uses_count, 0) + 1
    where ti.id = v_req.invite_id
      and ti.workspace_id = v_req.workspace_id
      and (ti.expires_at is null or ti.expires_at > now())
      and (ti.max_uses is null or coalesce(ti.uses_count, 0) < ti.max_uses)
    returning ti.role into v_role;

    if not found then
      raise exception using errcode = '23514', message = 'Invite is invalid for this request';
    end if;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_req.workspace_id, v_req.requester_user_id, v_role)
  on conflict on constraint workspace_members_pkey do nothing;

  return query
  update public.workspace_join_requests r
     set status = 'approved'::public.join_request_status,
         decided_by = v_user_id,
         decided_at = now()
   where r.id = v_req.id
     and r.status = 'pending'::public.join_request_status
  returning r.id, r.workspace_id, r.requester_user_id, r.invite_id;

  if not found then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_workspace_join_request (
  p_request_id uuid
)
  RETURNS TABLE (
    id           uuid,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_req public.workspace_join_requests%rowtype;
begin
  if not public.mfa_satisfied() then
    raise exception using errcode = '42501', message = 'mfa_required';
  end if;

  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized';
  end if;

  select *
    into v_req
  from public.workspace_join_requests
  where workspace_join_requests.id = p_request_id
    and public.is_workspace_admin(workspace_join_requests.workspace_id)
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Join request not found or not authorized';
  end if;

  if v_req.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;

  if not public.is_workspace_admin(v_req.workspace_id) then
    raise exception using errcode = '42501', message = 'Only owners or admins may reject join requests.';
  end if;

  return query
  update public.workspace_join_requests r
     set status = 'denied'::public.join_request_status,
         decided_by = v_user_id,
         decided_at = now()
   where r.id = v_req.id
     and r.status = 'pending'::public.join_request_status
  returning r.id, r.workspace_id;

  if not found then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_credit_code (
  p_code         text,
  p_workspace_id uuid
)
  RETURNS TABLE (
    status               text,
    message              text,
    grant_id             uuid,
    amount_nanos         bigint,
    before_balance_nanos bigint,
    after_balance_nanos  bigint,
    workspace_id         uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_code_normalized text;
  v_grant public.credit_grants%rowtype;
  v_wallet public.wallets%rowtype;
  v_team_billing_mode text;
  v_redemption_id uuid;
begin
  if not public.mfa_satisfied() then
    raise exception using errcode = '42501', message = 'mfa_required';
  end if;

  if v_user_id is null then
    return query
    select
      'unauthorized'::text,
      'You must be signed in to redeem a credit code.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    return query
    select
      'team_forbidden'::text,
      'You do not have access to this team.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select lower(coalesce(t.billing_mode::text, 'wallet'))
  into v_team_billing_mode
  from public.workspaces t
  where t.id = p_workspace_id;

  if not found then
    return query
    select
      'team_forbidden'::text,
      'You do not have access to this team.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if v_team_billing_mode = 'invoice' then
    return query
    select
      'invoice_mode'::text,
      'Credit codes are not available for invoice billing teams.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  v_code_normalized := upper(trim(coalesce(p_code, '')));

  if v_code_normalized = ''
    or length(v_code_normalized) > 64
    or v_code_normalized !~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'
  then
    return query
    select
      'invalid_code_format'::text,
      'Credit code format is invalid.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select *
  into v_grant
  from public.credit_grants cg
  where cg.code_normalized = v_code_normalized
  for update;

  if not found then
    return query
    select
      'not_found'::text,
      'This credit code is invalid.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if not coalesce(v_grant.is_active, false) then
    return query
    select
      'inactive'::text,
      'This credit code is inactive.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if v_grant.expires_at is not null and v_grant.expires_at <= now() then
    return query
    select
      'expired'::text,
      'This credit code has expired.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if coalesce(v_grant.redemptions_count, 0) >= v_grant.max_redemptions then
    return query
    select
      'maxed_out'::text,
      'This credit code has reached its redemption limit.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select *
  into v_wallet
  from public.wallets w
  where w.workspace_id = p_workspace_id
  for update;

  if not found then
    return query
    select
      'wallet_not_found'::text,
      'Wallet not found for this team.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  insert into public.credit_grant_redemptions (
    grant_id,
    user_id,
    workspace_id,
    amount_nanos
  ) values (
    v_grant.id,
    v_user_id,
    p_workspace_id,
    v_grant.amount_nanos
  )
  on conflict on constraint credit_grant_redemptions_grant_user_unique
  do nothing
  returning id
  into v_redemption_id;

  if v_redemption_id is null then
    return query
    select
      'already_redeemed'::text,
      'You have already redeemed this credit code.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  update public.wallets as w
  set balance_nanos = w.balance_nanos + v_grant.amount_nanos,
      updated_at = now()
  where w.workspace_id = p_workspace_id
  returning w.*
  into v_wallet;

  insert into public.credit_ledger (
    workspace_id,
    event_time,
    kind,
    amount_nanos,
    before_balance_nanos,
    after_balance_nanos,
    ref_type,
    ref_id,
    created_at,
    status
  ) values (
    p_workspace_id,
    now(),
    'promo_code',
    v_grant.amount_nanos,
    v_wallet.balance_nanos - v_grant.amount_nanos,
    v_wallet.balance_nanos,
    'promo_code_redeem',
    v_redemption_id::text,
    now(),
    'paid'
  ) on conflict (ref_type, ref_id) do nothing;

  update public.credit_grants
  set redemptions_count = redemptions_count + 1
  where id = v_grant.id;

  return query
  select
    'succeeded'::text,
    'Promo credit applied successfully.'::text,
    v_grant.id,
    v_grant.amount_nanos,
    v_wallet.balance_nanos - v_grant.amount_nanos,
    v_wallet.balance_nanos,
    p_workspace_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_workspace_key_usage (
  p_workspace_id uuid,
  p_day_start    timestamp with time zone
)
  RETURNS TABLE (
    key_id              uuid,
    daily_request_count bigint,
    daily_cost_nanos    bigint,
    last_used_at        timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    gr.key_id,
    count(*) filter (where gr.created_at >= p_day_start)::bigint as daily_request_count,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= p_day_start), 0)::bigint as daily_cost_nanos,
    max(gr.created_at) as last_used_at
  from private.v2_rpc_gateway_requests_compat gr
  where gr.workspace_id = p_workspace_id
    and gr.key_id is not null
    and gr.success is true
    and public.is_workspace_member(p_workspace_id)
    and public.mfa_satisfied()
  group by gr.key_id;
$function$;

CREATE OR REPLACE FUNCTION public.monthly_spend_prev_cents (
  p_workspace_id uuid
)
  RETURNS bigint
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_current_month_start_ts timestamptz := (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  v_prev_month_start_ts timestamptz := ((date_trunc('month', now() at time zone 'UTC') - interval '1 month') at time zone 'UTC');
  v_prev_month_nanos bigint := 0;
  v_prev_month_cents bigint := 0;
begin
  if not public.mfa_satisfied() then
    raise exception using errcode = '42501', message = 'mfa_required';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;

  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  ) and not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = v_user_id
  ) then
    raise exception 'workspace_forbidden';
  end if;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_prev_month_nanos
  from private.v2_rpc_gateway_requests_compat gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_prev_month_start_ts
    and gr.created_at < v_current_month_start_ts;

  v_prev_month_cents := floor(v_prev_month_nanos::numeric / 10000000.0)::bigint;
  return v_prev_month_cents;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mtd_spend_cents (
  p_workspace_id uuid
)
  RETURNS bigint
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_now_utc timestamptz := now();
  v_current_month_start_ts timestamptz := (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  v_mtd_nanos bigint := 0;
  v_mtd_cents bigint := 0;
begin
  if not public.mfa_satisfied() then
    raise exception using errcode = '42501', message = 'mfa_required';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;

  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  ) and not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = v_user_id
  ) then
    raise exception 'workspace_forbidden';
  end if;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_mtd_nanos
  from private.v2_rpc_gateway_requests_compat gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_current_month_start_ts
    and gr.created_at <= v_now_utc;

  v_mtd_cents := floor(v_mtd_nanos::numeric / 10000000.0)::bigint;
  return v_mtd_cents;
end;
$function$;
