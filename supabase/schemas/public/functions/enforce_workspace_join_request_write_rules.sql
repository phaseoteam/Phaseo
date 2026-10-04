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

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_join_request_write_rules"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_join_request_write_rules"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_join_request_write_rules"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_join_request_write_rules"() FROM PUBLIC, "anon", "authenticated";
