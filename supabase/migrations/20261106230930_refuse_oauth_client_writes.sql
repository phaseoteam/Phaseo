-- phaseo:rewrite-unapplied-migration reason: never applied in any environment; the original deadlocked in production db push on 2026-11-07 (main CI run 42320225444, both attempts) and rolled back, so production history ends at 20261106230929
-- Tokens the auth provider's OAuth server issues to apps carry the app's client_id. That includes the Phaseo CLI
-- and desktop app, whose client IDs are public. This migration adds the helper the per-table policies use, and
-- makes the SECURITY DEFINER functions signed-in users can call that change membership refuse such a token
-- (they bypass RLS). It locks no table: the restrictive policies follow in one migration per table
-- (*_oauth_client_policies_<table>.sql), so no transaction holds locks on two tables at once.
-- This file was rewritten before it ever applied: its first version created the policies on 69 tables in one
-- transaction and deadlocked against live readers in production, rolling back both times.
-- The other callable definer functions read data, are policy helpers, or only add to the caller's own counters
-- or credit (refuse-oauth-client-writes.test.mjs lists each one with its reason).

CREATE OR REPLACE FUNCTION public.request_is_oauth_client ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select (auth.jwt() ->> 'client_id') is not null;
$function$;

COMMENT ON FUNCTION "public"."request_is_oauth_client"() IS 'True when the request carries a token the OAuth server issued to an app (it has a top-level client_id). Restrictive RLS policies and SECURITY DEFINER functions use it to refuse writes from app tokens, including the public CLI and desktop clients.';

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."request_is_oauth_client"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."request_is_oauth_client"() FROM PUBLIC, "anon";

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

  -- A token issued to an OAuth client (the CLI and desktop app too) cannot change membership.
  if public.request_is_oauth_client() then
    raise exception using errcode = '42501', message = 'oauth_client_refused';
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

  -- A token issued to an OAuth client (the CLI and desktop app too) cannot change membership.
  if public.request_is_oauth_client() then
    raise exception using errcode = '42501', message = 'oauth_client_refused';
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
