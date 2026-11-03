-- Security review 2026-11-03, second pass.
-- phaseo:allow-destructive-migration reason: the only match is the TRUNCATE privilege named in a REVOKE statement below, taken away from anon and authenticated on management_keys; no table is truncated, nothing is dropped and no data is deleted.

-- 1. A removed member's keys stop working. Removing someone revoked their OAuth grants but left the
-- API keys and management keys they created active, and the gateway never checks the creator is still
-- a member, so a removed admin's management key could keep creating keys. Keys belong to the person who
-- made them: they are revoked with that person's membership, whichever way it ends (removed by the
-- owner, leaving, SCIM, or deleting their account).
CREATE OR REPLACE FUNCTION public.revoke_oauth_on_workspace_member_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.oauth_authorizations
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and revoked_at is null;

  update public.oauth_refresh_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and revoked_at is null;

  -- Paused and disabled keys are revoked too, so nobody left can turn them back on.
  update public.keys
  set status = 'revoked',
    revoked_reason = coalesce(revoked_reason, 'member_removed')
  where workspace_id = old.workspace_id
    and created_by = old.user_id
    and status not in ('revoked', 'compromised', 'deleted');

  update public.management_keys
  set status = 'revoked',
    revoked_at = coalesce(revoked_at, now()),
    revoked_reason = coalesce(revoked_reason, 'member_removed')
  where workspace_id = old.workspace_id
    and created_by = old.user_id
    and status not in ('revoked', 'compromised', 'deleted');

  return old;
end;
$function$;

COMMENT ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() IS 'When someone stops being a workspace member, revokes their OAuth grants and refresh tokens there and the API keys and management keys they created there.';

-- 2. Key creators are trustworthy. Revocation follows created_by, so signed-in clients may not set it
-- to someone else or change it (an admin could otherwise pin their keys on the owner before leaving).
-- The API and web-api write keys with the service role and keep full control. A management key whose
-- creator's account is deleted (created_by is set to NULL) is revoked with it.
CREATE OR REPLACE FUNCTION public.protect_key_created_by()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') and new.created_by is distinct from auth.uid() then
      raise exception 'key_creator_locked'
        using errcode = '42501',
          detail = 'A key''s creator is the signed-in user who creates it.';
    end if;
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    if current_user in ('anon', 'authenticated') then
      raise exception 'key_creator_locked'
        using errcode = '42501',
          detail = 'A key''s creator cannot be changed.';
    end if;
    if new.created_by is null and new.status not in ('revoked', 'compromised', 'deleted') then
      new.status := 'revoked';
      new.revoked_at := coalesce(new.revoked_at, now());
      new.revoked_reason := coalesce(new.revoked_reason, 'creator_deleted');
    end if;
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_key_created_by"() IS 'Stops signed-in clients from creating a key in someone else''s name or changing its creator, and revokes a key whose creator''s account is deleted.';

REVOKE ALL ON FUNCTION "public"."protect_key_created_by"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE TRIGGER protect_key_created_by
  BEFORE INSERT OR UPDATE OF created_by ON public.keys
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_key_created_by();

CREATE TRIGGER protect_management_key_created_by
  BEFORE INSERT OR UPDATE OF created_by ON public.management_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_key_created_by();

-- Keys already left behind by former members (none on 2026-11-03) are revoked the same way.
UPDATE public.keys key_row
SET status = 'revoked',
  revoked_reason = coalesce(key_row.revoked_reason, 'member_removed')
WHERE key_row.status NOT IN ('revoked', 'compromised', 'deleted')
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members member
    WHERE member.workspace_id = key_row.workspace_id AND member.user_id = key_row.created_by
  );

UPDATE public.management_keys key_row
SET status = 'revoked',
  revoked_at = coalesce(key_row.revoked_at, now()),
  revoked_reason = coalesce(key_row.revoked_reason, CASE WHEN key_row.created_by IS NULL THEN 'creator_deleted' ELSE 'member_removed' END)
WHERE key_row.status NOT IN ('revoked', 'compromised', 'deleted')
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members member
    WHERE member.workspace_id = key_row.workspace_id AND member.user_id = key_row.created_by
  );

-- Like keys in the first pass: PostgREST never needs these, and TRUNCATE ignores RLS.
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."management_keys" FROM "anon", "authenticated";

-- 3. Public presets no longer show unpublished edits. The draft_* columns hold changes the author has
-- not published, and anyone could read them on a public preset. Signed-in and anonymous clients now
-- read every column except the drafts; the app reads drafts with the service role.
REVOKE SELECT ON TABLE "public"."presets" FROM "anon", "authenticated";

GRANT SELECT ("active_version_id", "archived_at", "config", "created_at", "created_by", "description", "fork_depth", "id", "name", "root_preset_id", "slug", "source_preset_id", "source_preset_version_id", "updated_at", "upstream_version_id", "versioning_method", "visibility", "workspace_id") ON TABLE "public"."presets" TO "anon";

GRANT SELECT ("active_version_id", "archived_at", "config", "created_at", "created_by", "description", "fork_depth", "id", "name", "root_preset_id", "slug", "source_preset_id", "source_preset_version_id", "updated_at", "upstream_version_id", "versioning_method", "visibility", "workspace_id") ON TABLE "public"."presets" TO "authenticated";

-- 4. Only the owner makes someone an admin by invite. Role changes were already owner-only, but admins
-- could create an admin invite, or switch a member invite to admin through the Data API.
CREATE OR REPLACE FUNCTION public.enforce_workspace_invite_role_policy()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if lower(coalesce(new.role::text, '')) not in ('admin', 'member') then
    raise exception using
      errcode = '23514',
      message = 'invalid_workspace_invite_role',
      detail = 'Invite roles are restricted to admin and member.';
  end if;

  -- Like role changes, making someone an admin is the owner's call. Signed-in clients (admins can
  -- write invites through the Data API) may only create an admin invite, switch one to admin, or move
  -- one into a workspace as that workspace's owner; the service role (web-api checks the owner itself)
  -- has no auth.uid() and is not limited here.
  if new.role::text = 'admin'
    and (tg_op = 'INSERT' or old.role is distinct from new.role or old.workspace_id is distinct from new.workspace_id)
    and auth.uid() is not null
    and not exists (
      select 1 from public.workspaces w where w.id = new.workspace_id and w.owner_user_id = auth.uid()
    ) then
    raise exception using
      errcode = '42501',
      message = 'workspace_invite_admin_owner_only',
      detail = 'Only the workspace owner can invite admins.';
  end if;

  return new;
end;
$function$;
