-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- phaseo:allow-production-history-backfill reason: Version 20260907233627 is already applied in production; restore its recorded SQL without replaying it.
-- Original version and SQL are retained; this migration is already applied in production.

-- Repair functions that still referenced removed team_* tables.
-- Keep policy helper identities; align account RPC parameters/results with their current callers.
create or replace function public.is_team_owner(p_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = p_team_id and w.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_team_id and wm.user_id = auth.uid() and wm.role = 'owner'
  );
$$;

create or replace function public.is_active_invite_for_workspace(p_invite_id uuid, p_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.workspace_invites i
    where i.id = p_invite_id and i.workspace_id = p_team_id
      and (i.expires_at is null or i.expires_at > now())
      and (i.max_uses is null or coalesce(i.uses_count, 0) < i.max_uses)
  );
$$;

-- No policy/view depends on this RPC; replacement is atomic within the migration.
drop function public.approve_workspace_join_request(uuid);
CREATE OR REPLACE FUNCTION public.approve_workspace_join_request(p_request_id uuid)
 RETURNS TABLE(id uuid, workspace_id uuid, requester_user_id uuid, invite_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_req public.workspace_join_requests%rowtype;
  v_role public.workspace_role := 'member'::public.workspace_role;
begin
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
$function$
;
revoke execute on function public.approve_workspace_join_request(uuid) from public, anon;
grant execute on function public.approve_workspace_join_request(uuid) to authenticated, service_role;

-- No policy/view depends on this RPC; replacement is atomic within the migration.
drop function public.reject_workspace_join_request(uuid);
CREATE OR REPLACE FUNCTION public.reject_workspace_join_request(p_request_id uuid)
 RETURNS TABLE(id uuid, workspace_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_req public.workspace_join_requests%rowtype;
begin
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
$function$
;
revoke execute on function public.reject_workspace_join_request(uuid) from public, anon;
grant execute on function public.reject_workspace_join_request(uuid) to authenticated, service_role;

-- No policy/view depends on this RPC; replacement is atomic within the migration.
drop function public.redeem_credit_code(text,uuid);
CREATE OR REPLACE FUNCTION public.redeem_credit_code(p_code text, p_workspace_id uuid)
 RETURNS TABLE(status text, message text, grant_id uuid, amount_nanos bigint, before_balance_nanos bigint, after_balance_nanos bigint, workspace_id uuid)
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
$function$
;
revoke execute on function public.redeem_credit_code(text,uuid) from public, anon;
grant execute on function public.redeem_credit_code(text,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
