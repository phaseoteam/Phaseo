-- The state on origin/main on 2026-11-04, before the workspace role rules migration; local tests only.
-- The test creates the minimal tables and loads the unchanged function files first. These are the old
-- trigger and join-request approval functions, and the policies and grants production has on these tables.

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
      from public.team_invites ti
      where ti.id = new.invite_id
        and ti.team_id = new.team_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'invite_team_mismatch',
        detail = 'Join request invite must belong to the same team.';
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

  if new.team_id <> old.team_id or new.requester_user_id <> old.requester_user_id then
    raise exception using
      errcode = '23514',
      message = 'join_request_immutable_fields_modified',
      detail = 'team_id and requester_user_id are immutable.';
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
  end if;

  return new;
end;
$function$;

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
grant execute on function public.approve_workspace_join_request(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.management_decide_workspace_join_request (
  p_workspace_id  uuid,
  p_request_id    uuid,
  p_decision      text,
  p_actor_user_id uuid
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

    insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, v_request.requester_user_id, v_role)
    on conflict (workspace_id, user_id) do nothing;
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
grant execute on function public.management_decide_workspace_join_request(uuid, uuid, text, uuid) to service_role;

create trigger workspace_members_role_policy_guard before insert or update on public.workspace_members
  for each row execute function public.enforce_workspace_member_role_policy();
create trigger workspace_invites_role_policy_guard before insert or update on public.workspace_invites
  for each row execute function public.enforce_workspace_invite_role_policy();
create trigger workspace_join_requests_write_rules_guard before insert or update on public.workspace_join_requests
  for each row execute function public.enforce_workspace_join_request_write_rules();
create trigger protect_data_contribution_settings before insert or update on public.workspace_settings
  for each row execute function public.protect_data_contribution_settings();

-- workspace_members
CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_members" AS RESTRICTIVE FOR ALL TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
CREATE POLICY "team_members_insert_admin" ON "public"."workspace_members" FOR INSERT TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "team_members_select_own_team" ON "public"."workspace_members" FOR SELECT TO "authenticated"
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "team_members_update_admin" ON "public"."workspace_members" FOR UPDATE TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK ((public.is_workspace_admin(workspace_id) AND (NOT (EXISTS ( SELECT 1 FROM public.workspaces t
  WHERE ((t.id = workspace_members.workspace_id) AND (t.owner_user_id = workspace_members.user_id) AND (lower(COALESCE((workspace_members.role)::text, ''::text)) <> 'owner'::text)))))));
CREATE POLICY "workspace_members_delete_authorized" ON "public"."workspace_members" FOR DELETE TO "authenticated"
  USING (((NOT (EXISTS ( SELECT 1 FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = workspace_members.user_id))))) AND
    (public.is_workspace_admin(workspace_id) OR (user_id = ( SELECT auth.uid() AS uid)))));
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_members" TO "anon";
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";

-- workspaces (owner_user_id is not client-writable)
CREATE POLICY "teams_select_own_team" ON "public"."workspaces" FOR SELECT TO "authenticated" USING (public.is_workspace_member(id));
GRANT SELECT ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";

-- workspace_invites
CREATE POLICY "team_invites_insert_own_team" ON "public"."workspace_invites" FOR INSERT TO "authenticated"
  WITH CHECK ((public.is_workspace_admin(workspace_id) AND (role = ANY (ARRAY['admin'::public.workspace_role, 'member'::public.workspace_role]))));
CREATE POLICY "team_invites_select_own_team" ON "public"."workspace_invites" FOR SELECT TO "authenticated"
  USING (public.is_workspace_member(workspace_id));
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invites" TO "service_role";

-- workspace_join_requests
CREATE POLICY "team_join_requests_insert" ON "public"."workspace_join_requests" FOR INSERT TO "authenticated"
  WITH CHECK (((requester_user_id = ( SELECT auth.uid() AS uid)) AND (invite_id IS NOT NULL) AND (status = 'pending'::public.join_request_status) AND (decided_by IS NULL) AND (decided_at IS NULL) AND (NOT public.is_workspace_member(workspace_id)) AND
    public.is_active_invite_for_workspace(invite_id, workspace_id)));
CREATE POLICY "team_join_requests_select" ON "public"."workspace_join_requests" FOR SELECT TO "authenticated"
  USING ((public.is_workspace_member(workspace_id) OR (requester_user_id = ( SELECT auth.uid() AS uid))));
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_join_requests" TO "service_role";

-- workspace_settings
CREATE POLICY "team_settings_insert_own_team" ON "public"."workspace_settings" FOR INSERT TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "team_settings_select_own_team" ON "public"."workspace_settings" FOR SELECT TO "authenticated"
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "team_settings_update_own_team" ON "public"."workspace_settings" FOR UPDATE TO "authenticated"
  USING (public.is_workspace_admin(workspace_id)) WITH CHECK (public.is_workspace_admin(workspace_id));
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_settings" TO "service_role";
