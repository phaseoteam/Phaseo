-- Workspace role rules, enforced in the database as well as the apps (review 2026-11-04). Settings already
-- applies them; these close the paths around it through the Data API (PostgREST).
-- phaseo:allow-destructive-migration reason: the only DELETE statements are inside the bodies of the functions redefined below, which run only when called; this migration deletes no rows, drops no table and truncates nothing (DROP POLICY IF EXISTS only replaces policy definitions).

-- 1. workspace_members. Admins could insert any user into their workspace (with a forged joined_at),
-- promote members to admin and remove other admins (which revokes their keys). People join only through
-- an invite and an approved join request (approve_workspace_join_request / the management API, both
-- SECURITY DEFINER or service role) or SCIM/SSO provisioning on the server, so signed-in users lose
-- INSERT. Only the owner changes roles (only the role column is updatable), and members are removed by
-- the owner, or leave themselves; nobody removes the owner. service_role is unaffected.
DROP POLICY IF EXISTS "team_members_insert_admin" ON "public"."workspace_members";
DROP POLICY IF EXISTS "team_members_update_admin" ON "public"."workspace_members";

REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."workspace_members" FROM "anon";
REVOKE INSERT, UPDATE ON TABLE "public"."workspace_members" FROM "authenticated";
GRANT UPDATE ("role") ON TABLE "public"."workspace_members" TO "authenticated";

DROP POLICY IF EXISTS "workspace_members_update_owner" ON "public"."workspace_members";
CREATE POLICY "workspace_members_update_owner" ON "public"."workspace_members"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))));

ALTER POLICY "workspace_members_delete_authorized" ON "public"."workspace_members"
  USING (((NOT (EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = workspace_members.user_id))))) AND
    ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))) OR (user_id = ( SELECT auth.uid() AS uid)))));

-- 2. Join requests. The write-rules trigger still read the old team_invites table and team_id column, so
-- every join request with an invite (all of them) failed, and so did every approval.
CREATE OR REPLACE FUNCTION public.enforce_workspace_join_request_write_rules()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.invite_id is not null then
    if not exists (
      select 1
      from public.workspace_invites ti
      where ti.id = new.invite_id
        and ti.workspace_id = new.workspace_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'invite_team_mismatch',
        detail = 'Join request invite must belong to the same workspace.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending'::join_request_status
       or new.decided_by is not null
       or new.decided_at is not null then
      raise exception using
        errcode = '23514',
        message = 'invalid_join_request_insert_state',
        detail = 'New join requests must be pending and undecided.';
    end if;
    return new;
  end if;

  -- UPDATE path
  if old.status <> 'pending'::join_request_status then
    raise exception using
      errcode = '23514',
      message = 'join_request_already_decided',
      detail = 'Only pending join requests can be updated.';
  end if;

  if new.status not in ('approved'::join_request_status, 'denied'::join_request_status) then
    raise exception using
      errcode = '23514',
      message = 'invalid_join_request_status_transition',
      detail = 'Join request updates must transition to approved or denied.';
  end if;

  if new.decided_by is null or new.decided_at is null then
    raise exception using
      errcode = '23514',
      message = 'join_request_decision_metadata_required',
      detail = 'Decided join requests must include decided_by and decided_at.';
  end if;

  if new.workspace_id <> old.workspace_id or new.requester_user_id <> old.requester_user_id then
    raise exception using
      errcode = '23514',
      message = 'join_request_immutable_fields_modified',
      detail = 'workspace_id and requester_user_id are immutable.';
  end if;

  if new.invite_id is distinct from old.invite_id then
    raise exception using
      errcode = '23514',
      message = 'join_request_invite_immutable',
      detail = 'invite_id is immutable after request creation.';
  end if;

  return new;
end;
$function$;

-- 3. Approving a join request adds the requester with the invite's role. When that role is admin, the
-- approver must be the workspace owner, checked inside the same transaction as the insert.
-- management_decide_workspace_join_request also failed on every approval: its bare ON CONFLICT
-- (workspace_id, user_id) was ambiguous with the workspace_id output column; it now names the constraint.
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

  -- Making someone an admin is the owner's call, also when the role comes from the invite.
  if v_role = 'admin'::public.workspace_role and not exists (
    select 1 from public.workspaces w where w.id = v_req.workspace_id and w.owner_user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'workspace_admin_owner_only',
      detail = 'Only the workspace owner can approve someone as an admin.';
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

-- It also takes the role to give (instead of the invite's) as an optional argument, applied in the same
-- transaction, so the management API never approves with one role and then changes it in a second call.
-- The new argument changes the signature, so the old one is dropped first; callers that don't pass it get
-- the invite's role, as before.
DROP FUNCTION IF EXISTS public.management_decide_workspace_join_request(uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.management_decide_workspace_join_request (
  p_workspace_id  uuid,
  p_request_id    uuid,
  p_decision      text,
  p_actor_user_id uuid,
  p_role          text DEFAULT NULL::text
)
  RETURNS TABLE (
    id                uuid,
    workspace_id      uuid,
    requester_user_id uuid,
    invite_id         uuid,
    status            public.join_request_status,
    decided_at        timestamp with time zone,
    decided_by        uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_request public.workspace_join_requests%rowtype;
  v_role public.workspace_role := 'member'::public.workspace_role;
  v_status public.join_request_status;
begin
  if p_actor_user_id is null then
    raise exception using errcode = '23514', message = 'Decision actor is required';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '23514', message = 'Decision must be approve or reject';
  end if;
  if p_role is not null and p_role not in ('admin', 'member') then
    raise exception using errcode = '23514', message = 'Role must be admin or member';
  end if;

  select * into v_request
  from public.workspace_join_requests request
  where request.id = p_request_id
    and request.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Join request not found';
  end if;
  if v_request.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Join request already decided';
  end if;

  if p_decision = 'approve' then
    if v_request.invite_id is not null then
      update public.workspace_invites invite
      set uses_count = coalesce(invite.uses_count, 0) + 1
      where invite.id = v_request.invite_id
        and invite.workspace_id = p_workspace_id
        and (invite.expires_at is null or invite.expires_at > now())
        and (invite.max_uses is null or coalesce(invite.uses_count, 0) < invite.max_uses)
      returning invite.role into v_role;
      if not found then
        raise exception using errcode = '23514', message = 'Invite is no longer valid';
      end if;
    end if;

    -- A role given with the approval replaces the invite's, in this same transaction, so a request is
    -- never left approved with the invite's role and a separate role change still to make.
    if p_role is not null then
      v_role := p_role::public.workspace_role;
    end if;

    -- Making someone an admin is the owner's call, also when the role comes from the invite.
    if v_role = 'admin'::public.workspace_role and not exists (
      select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_user_id = p_actor_user_id
    ) then
      raise exception using errcode = '42501', message = 'workspace_admin_owner_only',
        detail = 'Only the workspace owner can approve someone as an admin.';
    end if;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, v_request.requester_user_id, v_role)
    -- Name the constraint: a bare (workspace_id, user_id) clashes with the workspace_id output column.
    on conflict on constraint workspace_members_pkey do nothing;
    v_status := 'approved'::public.join_request_status;
  else
    v_status := 'denied'::public.join_request_status;
  end if;

  return query
  update public.workspace_join_requests request
  set status = v_status,
      decided_by = p_actor_user_id,
      decided_at = now()
  where request.id = v_request.id
    and request.status = 'pending'::public.join_request_status
  returning request.id, request.workspace_id, request.requester_user_id,
    request.invite_id, request.status, request.decided_at, request.decided_by;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid, text) TO "service_role";

COMMENT ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid, text) IS 'Atomically approves or rejects a workspace join request for the management API service role, optionally with the role to give instead of the invite''s.';

REVOKE ALL ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid, text) FROM PUBLIC, "anon", "authenticated";

-- 4. Single sign-on. Sign-ins through an identity provider are matched to the workspace whose settings
-- name that provider, so a workspace could claim another organization's provider. Signed-in users can no
-- longer write the sso_* columns (the API and web-api write them with the service role after checking the
-- role and the identity add-on), and an enabled provider can belong to one workspace only. Disabled
-- configurations don't reserve the provider.
CREATE OR REPLACE FUNCTION public.protect_data_contribution_settings()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.data_contribution_enabled is distinct from false
        or new.data_contribution_policy_version is not null
        or new.data_contribution_consented_at is not null
        or new.data_contribution_consented_by is not null
        or new.data_contribution_sample_rate_bps is distinct from 10000
        or new.data_contribution_classifier_sample_rate_bps is distinct from 1000
        or new.data_contribution_discount_bps is distinct from 100 then
        raise exception 'data contribution settings are platform controlled'
          using errcode = '42501';
      end if;
      if new.io_logging_billing_status is distinct from 'active'
        or new.io_logging_grace_until is not null
        or new.io_logging_last_billed_at is not null
        or new.io_logging_last_billing_warning_at is not null
        or new.io_logging_last_billing_warning_kind is not null
        or new.io_logging_price_per_million_units_nanos is distinct from 0 then
        raise exception 'extended log billing settings are platform controlled'
          using errcode = '42501';
      end if;
    elsif new.data_contribution_enabled is distinct from old.data_contribution_enabled
      or new.data_contribution_policy_version is distinct from old.data_contribution_policy_version
      or new.data_contribution_consented_at is distinct from old.data_contribution_consented_at
      or new.data_contribution_consented_by is distinct from old.data_contribution_consented_by
      or new.data_contribution_sample_rate_bps is distinct from old.data_contribution_sample_rate_bps
      or new.data_contribution_classifier_sample_rate_bps is distinct from old.data_contribution_classifier_sample_rate_bps
      or new.data_contribution_discount_bps is distinct from old.data_contribution_discount_bps then
      raise exception 'data contribution settings are platform controlled'
        using errcode = '42501';
    elsif new.io_logging_billing_status is distinct from old.io_logging_billing_status
      or new.io_logging_grace_until is distinct from old.io_logging_grace_until
      or new.io_logging_last_billed_at is distinct from old.io_logging_last_billed_at
      or new.io_logging_last_billing_warning_at is distinct from old.io_logging_last_billing_warning_at
      or new.io_logging_last_billing_warning_kind is distinct from old.io_logging_last_billing_warning_kind
      or new.io_logging_price_per_million_units_nanos is distinct from old.io_logging_price_per_million_units_nanos then
      raise exception 'extended log billing settings are platform controlled'
        using errcode = '42501';
    end if;

    -- Single sign-on decides which workspace a provider's sign-ins join, so it is written only by the
    -- API and web-api (service role), which check the owner or admin role and the identity add-on.
    if tg_op = 'INSERT' then
      if new.sso_enabled is distinct from false
        or new.sso_enforced is distinct from false
        or new.sso_mode is distinct from 'none'
        or new.sso_provider_identifier is not null
        or new.sso_domains is distinct from '{}'::text[] then
        raise exception 'single sign-on settings are platform controlled'
          using errcode = '42501';
      end if;
    elsif new.sso_enabled is distinct from old.sso_enabled
      or new.sso_enforced is distinct from old.sso_enforced
      or new.sso_mode is distinct from old.sso_mode
      or new.sso_provider_identifier is distinct from old.sso_provider_identifier
      or new.sso_domains is distinct from old.sso_domains then
      raise exception 'single sign-on settings are platform controlled'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_data_contribution_settings"() IS 'Prevents authenticated workspace administrators from forging platform-controlled contribution consent, billing terms, extended-log billing state and single sign-on settings.';

-- Production has no SSO provider identifiers set. If enabled duplicates exist at deploy, this fails and
-- the whole migration rolls back, rather than leaving uniqueness unenforced.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_settings_sso_provider_identifier_key ON public.workspace_settings USING btree (sso_provider_identifier)
  WHERE (sso_enabled AND (sso_provider_identifier IS NOT NULL));

-- 5. Directory. Deleting a department deletes the group mappings that use it, which can remove or demote
-- the admins they grant, so only the owner deletes a department that mappings use. Admins change a
-- member's department through a function that never writes the owner-controlled role override.
CREATE OR REPLACE FUNCTION public.management_delete_workspace_department (
  p_workspace_id  uuid,
  p_department_id uuid,
  p_actor_user_id uuid,
  p_request_id    text DEFAULT NULL::text
)
  RETURNS public.workspace_departments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare deleted public.workspace_departments;
begin
  select * into deleted from public.workspace_departments
  where id=p_department_id and workspace_id=p_workspace_id and source_type='manual' for update;
  if deleted is null then raise exception 'Department not found'; end if;
  -- Deleting the department also deletes its directory group mappings, which can remove or demote the
  -- admins they grant, so that is the owner's call. The department row lock above makes this check
  -- atomic: a new mapping's foreign-key check needs a key-share lock on that row, so it waits.
  if exists (
    select 1 from public.scim_group_mappings m where m.workspace_id=p_workspace_id and m.department_id=p_department_id
  ) and not exists (
    select 1 from public.workspaces w where w.id=p_workspace_id and w.owner_user_id=p_actor_user_id
  ) then
    raise exception using errcode='42501', message='department_has_group_mappings',
      detail='Only the workspace owner can delete a department that directory group mappings use.';
  end if;
  delete from public.workspace_department_grants where workspace_id=p_workspace_id and department_id=p_department_id;
  update public.workspace_member_overrides set
    department_override_enabled=false, department_id=null, department_position=null, updated_at=now()
  where workspace_id=p_workspace_id and department_id=p_department_id;
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'department_deleted');
  delete from public.workspace_departments where id=p_department_id and workspace_id=p_workspace_id returning * into deleted;
  insert into public.workspace_directory_audit_events(workspace_id,actor_user_id,action,target_type,target_id,before_state,request_id)
  values(p_workspace_id,p_actor_user_id,'workspace.department.delete','workspace_department',p_department_id::text,to_jsonb(deleted),p_request_id);
  return deleted;
end;
$function$;

-- Owner-set role overrides win over the role the SCIM reconcile derives from access grants. The
-- directory-change trigger and the override functions reapply them through one shared function, and so
-- does every SCIM function that suppresses the per-row triggers for a bulk write (below).
CREATE OR REPLACE FUNCTION public.apply_workspace_role_overrides (
  p_workspace_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare previous_reconcile_setting text;
begin
  -- The SCIM reconcile derives workspace_members.role from access grants alone; a role the owner set as
  -- an override wins over that. The directory-change trigger and every function that suppresses that
  -- trigger for a bulk write call this, so the override is reapplied the same way on every path.
  -- The reconcile flag keeps the manual-grant trigger from saving the override as a manual grant.
  previous_reconcile_setting := current_setting('phaseo.entitlement_reconcile',true);
  perform set_config('phaseo.entitlement_reconcile','on',true);
  update public.workspace_members wm set role=o.access_role::public.workspace_role
  from public.workspace_member_overrides o
  where wm.workspace_id=p_workspace_id and wm.workspace_id=o.workspace_id and wm.user_id=o.user_id and o.access_role is not null
    and lower(wm.role::text) is distinct from o.access_role;
  perform set_config('phaseo.entitlement_reconcile',case when previous_reconcile_setting='on' then 'on' else 'off' end,true);
end;
$function$;

COMMENT ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) IS 'Reapplies owner-set role overrides to workspace_members after a directory reconcile. Shared by the directory-change trigger and the SCIM bulk-write functions.';

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_workspace_role_overrides"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.refresh_effective_entitlements_after_directory_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare target_workspace_id uuid;
begin
  if current_setting('phaseo.scim_group_replace',true)='on' then return coalesce(new,old); end if;
  target_workspace_id := coalesce(new.workspace_id,old.workspace_id);
  perform public.apply_workspace_role_overrides(target_workspace_id);
  perform public.refresh_workspace_effective_entitlements(target_workspace_id,null,'directory_sync');
  return coalesce(new,old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_workspace_member_override (
  p_workspace_id                uuid,
  p_user_id                     uuid,
  p_access_role                 text,
  p_department_override_enabled boolean,
  p_department_id               uuid,
  p_department_position         text,
  p_actor_user_id               uuid,
  p_request_id                  text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare before_row jsonb; after_row jsonb; owner_id uuid;
begin
  select owner_user_id into owner_id from public.workspaces where id=p_workspace_id;
  if owner_id is null then raise exception 'Workspace not found'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then
    raise exception 'Workspace member not found';
  end if;
  if p_user_id=owner_id and (p_access_role is not null or p_department_override_enabled) then
    raise exception 'Workspace owner cannot be overridden';
  end if;
  if p_access_role is not null and p_access_role not in ('member','admin') then raise exception 'Invalid access role'; end if;
  if p_department_override_enabled and p_department_id is not null
     and not exists(select 1 from public.workspace_departments where id=p_department_id and workspace_id=p_workspace_id) then
    raise exception 'Department not found';
  end if;
  select to_jsonb(o) into before_row from public.workspace_member_overrides o where workspace_id=p_workspace_id and user_id=p_user_id;

  if p_access_role is null and not p_department_override_enabled then
    delete from public.workspace_member_overrides where workspace_id=p_workspace_id and user_id=p_user_id;
  else
    insert into public.workspace_member_overrides(workspace_id,user_id,access_role,department_override_enabled,department_id,department_position,updated_by)
    values(p_workspace_id,p_user_id,p_access_role,coalesce(p_department_override_enabled,false),
      case when p_department_override_enabled then p_department_id else null end,
      case when p_department_override_enabled then coalesce(p_department_position,'member') else null end,p_actor_user_id)
    on conflict(workspace_id,user_id) do update set access_role=excluded.access_role,
      department_override_enabled=excluded.department_override_enabled,department_id=excluded.department_id,
      department_position=excluded.department_position,updated_by=excluded.updated_by,updated_at=now();
  end if;

  perform public.reconcile_scim_entitlements(p_workspace_id);
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'manual_override');
  select to_jsonb(o) into after_row from public.workspace_member_overrides o where workspace_id=p_workspace_id and user_id=p_user_id;
  insert into public.workspace_directory_audit_events(workspace_id,actor_user_id,action,target_type,target_id,before_state,after_state,request_id)
  values(p_workspace_id,p_actor_user_id,'workspace.member.override','workspace_member',p_user_id::text,before_row,after_row,p_request_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_workspace_member_department_override (
  p_workspace_id                uuid,
  p_user_id                     uuid,
  p_department_override_enabled boolean,
  p_department_id               uuid,
  p_department_position         text,
  p_actor_user_id               uuid,
  p_request_id                  text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare before_row jsonb; after_row jsonb; owner_id uuid;
begin
  -- Changes only a member's department override. The role override (access_role) is the owner's and is
  -- never written here, so an admin's department change can't restore a role the owner just revoked.
  select owner_user_id into owner_id from public.workspaces where id=p_workspace_id;
  if owner_id is null then raise exception 'Workspace not found'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then
    raise exception 'Workspace member not found';
  end if;
  if p_user_id=owner_id and p_department_override_enabled then
    raise exception 'Workspace owner cannot be overridden';
  end if;
  if p_department_override_enabled and p_department_id is not null
     and not exists(select 1 from public.workspace_departments where id=p_department_id and workspace_id=p_workspace_id) then
    raise exception 'Department not found';
  end if;
  select to_jsonb(o) into before_row from public.workspace_member_overrides o where workspace_id=p_workspace_id and user_id=p_user_id;

  insert into public.workspace_member_overrides(workspace_id,user_id,access_role,department_override_enabled,department_id,department_position,updated_by)
  values(p_workspace_id,p_user_id,null,coalesce(p_department_override_enabled,false),
    case when p_department_override_enabled then p_department_id else null end,
    case when p_department_override_enabled then coalesce(p_department_position,'member') else null end,p_actor_user_id)
  on conflict(workspace_id,user_id) do update set
    department_override_enabled=excluded.department_override_enabled,department_id=excluded.department_id,
    department_position=excluded.department_position,updated_by=excluded.updated_by,updated_at=now();
  delete from public.workspace_member_overrides
  where workspace_id=p_workspace_id and user_id=p_user_id and access_role is null and not department_override_enabled;

  perform public.reconcile_scim_entitlements(p_workspace_id);
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'manual_override');
  select to_jsonb(o) into after_row from public.workspace_member_overrides o where workspace_id=p_workspace_id and user_id=p_user_id;
  insert into public.workspace_directory_audit_events(workspace_id,actor_user_id,action,target_type,target_id,before_state,after_state,request_id)
  values(p_workspace_id,p_actor_user_id,'workspace.member.department_override','workspace_member',p_user_id::text,before_row,after_row,p_request_id);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) TO "service_role";

COMMENT ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) IS 'Changes a workspace member''s department override without touching their role override; for admins, who may manage departments but not roles.';

REVOKE ALL ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) FROM PUBLIC, "anon", "authenticated";

-- 6. SCIM groups. A Group create (group then members) and a multi-operation Group PATCH ran as separate
-- calls, so a failure could leave an orphaned group, or "add the new member, remove the old one" half
-- done in a group that mappings make admins. Each is now one function, so one transaction. These functions,
-- and the existing Group replace functions, suppress the per-row directory triggers for the bulk write,
-- so each reapplies owner role overrides after its reconcile; without that, renaming a mapped group
-- gave an owner-demoted member the admin role back.
CREATE OR REPLACE FUNCTION public.create_scim_group (
  p_workspace_id uuid,
  p_external_id  text,
  p_display_name text,
  p_user_ids     uuid[]
)
  RETURNS public.scim_groups
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare created public.scim_groups;
begin
  -- The group and its members are created in one transaction, so a failure never leaves an empty or
  -- half-filled group behind (group mappings can make its members admins).
  if exists(select 1 from unnest(coalesce(p_user_ids,'{}'::uuid[])) candidate(user_id) where not exists(select 1 from public.scim_users where id=candidate.user_id and workspace_id=p_workspace_id)) then raise exception 'SCIM user not found in workspace' using errcode='23503'; end if;
  perform set_config('phaseo.scim_group_replace','on',true);
  insert into public.scim_groups(workspace_id,external_id,display_name) values (p_workspace_id,p_external_id,p_display_name) returning * into created;
  insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,created.id,user_id from (select distinct unnest(coalesce(p_user_ids,'{}'::uuid[])) user_id) users;
  perform public.reconcile_scim_entitlements(p_workspace_id);
  -- The per-row triggers are off for this bulk write, so owner role overrides are reapplied here.
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform set_config('phaseo.scim_group_replace','off',true);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,null,'scim_group_create');
  return created;
end;
$function$;

COMMENT ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) IS 'Creates a SCIM group with its members in one transaction, then reconciles directory entitlements once.';

GRANT EXECUTE ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.apply_scim_group_patch (
  p_workspace_id uuid,
  p_group_id     uuid,
  p_changes      jsonb
)
  RETURNS public.scim_groups
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  change jsonb;
  change_kind text;
  member_ids uuid[];
  patched public.scim_groups;
begin
  -- Every operation of one SCIM PATCH, and the group's metadata change, apply in one transaction: a
  -- later operation failing (or a deadlock) rolls back the earlier ones, so "add the new member, remove
  -- the old one" can never stop halfway with both in a group that mappings make admins.
  if not exists(select 1 from public.scim_groups where id=p_group_id and workspace_id=p_workspace_id) then raise exception 'SCIM group not found' using errcode='P0002'; end if;
  perform set_config('phaseo.scim_group_replace','on',true);
  for change in select value from jsonb_array_elements(coalesce(p_changes,'[]'::jsonb)) loop
    change_kind := change->>'kind';
    if change_kind = 'attributes' then
      update public.scim_groups set
        display_name = case when change->'values' ? 'display_name' then change->'values'->>'display_name' else display_name end,
        external_id = case when change->'values' ? 'external_id' then change->'values'->>'external_id' else external_id end
      where id=p_group_id and workspace_id=p_workspace_id;
      continue;
    end if;
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into member_ids from jsonb_array_elements_text(coalesce(change->'user_ids','[]'::jsonb));
    if change_kind in ('members-replace','members-add')
       and exists(select 1 from unnest(member_ids) candidate(user_id) where not exists(select 1 from public.scim_users where id=candidate.user_id and workspace_id=p_workspace_id)) then
      raise exception 'SCIM user not found in workspace' using errcode='23503';
    end if;
    if change_kind = 'members-replace' then
      delete from public.scim_group_members where workspace_id=p_workspace_id and group_id=p_group_id;
      insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,p_group_id,user_id from unnest(member_ids) user_id;
    elsif change_kind = 'members-add' then
      insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,p_group_id,user_id from unnest(member_ids) user_id
      on conflict (group_id,user_id) do nothing;
    elsif change_kind = 'members-remove' then
      delete from public.scim_group_members where workspace_id=p_workspace_id and group_id=p_group_id and user_id=any(member_ids);
    else
      raise exception 'Unsupported SCIM Group PATCH change: %', change_kind using errcode='22023';
    end if;
  end loop;
  update public.scim_groups set updated_at=now() where id=p_group_id and workspace_id=p_workspace_id returning * into patched;
  perform public.reconcile_scim_entitlements(p_workspace_id);
  -- The per-row triggers are off for this bulk write, so owner role overrides are reapplied here.
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform set_config('phaseo.scim_group_replace','off',true);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,null,'scim_group_patch');
  return patched;
end;
$function$;

COMMENT ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) IS 'Applies all operations of one SCIM Group PATCH (attributes and member add/remove/replace) and the metadata change in one transaction, then reconciles directory entitlements once.';

GRANT EXECUTE ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.replace_scim_group (
  p_workspace_id uuid,
  p_group_id     uuid,
  p_external_id  text,
  p_display_name text,
  p_user_ids     uuid[]
)
  RETURNS public.scim_groups
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare replaced public.scim_groups;
begin
  if not exists(select 1 from public.scim_groups where id=p_group_id and workspace_id=p_workspace_id) then raise exception 'SCIM group not found' using errcode='P0002'; end if;
  if exists(select 1 from unnest(coalesce(p_user_ids,'{}'::uuid[])) candidate(user_id) where not exists(select 1 from public.scim_users where id=candidate.user_id and workspace_id=p_workspace_id)) then raise exception 'SCIM user not found in workspace' using errcode='23503'; end if;
  perform set_config('phaseo.scim_group_replace','on',true);
  update public.scim_groups set external_id=p_external_id,display_name=p_display_name where id=p_group_id and workspace_id=p_workspace_id returning * into replaced;
  delete from public.scim_group_members where workspace_id=p_workspace_id and group_id=p_group_id;
  insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,p_group_id,user_id from (select distinct unnest(coalesce(p_user_ids,'{}'::uuid[])) user_id) users;
  perform public.reconcile_scim_entitlements(p_workspace_id);
  -- The per-row triggers are off for this bulk write, so owner role overrides are reapplied here.
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform set_config('phaseo.scim_group_replace','off',true);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,null,'scim_group_replace');
  return replaced;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_scim_group_members (
  p_workspace_id uuid,
  p_group_id     uuid,
  p_user_ids     uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if not exists(select 1 from public.scim_groups where id=p_group_id and workspace_id=p_workspace_id) then raise exception 'SCIM group not found' using errcode='P0002'; end if;
  if exists(select 1 from unnest(coalesce(p_user_ids,'{}'::uuid[])) candidate(user_id) where not exists(select 1 from public.scim_users where id=candidate.user_id and workspace_id=p_workspace_id)) then raise exception 'SCIM user not found in workspace' using errcode='23503'; end if;
  perform set_config('phaseo.scim_group_replace','on',true);
  delete from public.scim_group_members where workspace_id=p_workspace_id and group_id=p_group_id;
  insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,p_group_id,user_id from (select distinct unnest(coalesce(p_user_ids,'{}'::uuid[])) user_id) users;
  update public.scim_groups set updated_at=now() where id=p_group_id and workspace_id=p_workspace_id;
  perform public.reconcile_scim_entitlements(p_workspace_id);
  -- The per-row triggers are off for this bulk write, so owner role overrides are reapplied here.
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform set_config('phaseo.scim_group_replace','off',true);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,null,'scim_group_replace');
end;
$function$;

