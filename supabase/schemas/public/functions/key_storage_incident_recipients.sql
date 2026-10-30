CREATE OR REPLACE FUNCTION public.key_storage_incident_recipients (
  p_incident_id uuid
)
  RETURNS TABLE (
    workspace_id   uuid,
    workspace_name text,
    user_id        uuid,
    email          text,
    keys           bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The owners and admins of each workspace an applied incident changed, with
  -- how many of that workspace's keys it changed. Service-only.
  with affected as (
    select changed.workspace_id, count(*) as keys
    from public.key_storage_incident_keys as changed
    where changed.incident_id = p_incident_id
    group by changed.workspace_id
  ), people as (
    select member.workspace_id, member.user_id
    from public.workspace_members as member
    join affected on affected.workspace_id = member.workspace_id
    where member.role::text in ('owner', 'admin')
    union
    select workspace.id, workspace.owner_user_id
    from public.workspaces as workspace
    join affected on affected.workspace_id = workspace.id
    where workspace.owner_user_id is not null
  )
  select people.workspace_id, workspace.name, people.user_id, account.email::text, affected.keys
  from people
  join affected on affected.workspace_id = people.workspace_id
  join public.workspaces as workspace on workspace.id = people.workspace_id
  join auth.users as account on account.id = people.user_id
  where nullif(btrim(account.email), '') is not null
  order by people.workspace_id, people.user_id;
$function$;

COMMENT ON FUNCTION "public"."key_storage_incident_recipients"(uuid) IS 'Owners and admins to email for each workspace a key storage incident changed. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."key_storage_incident_recipients"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."key_storage_incident_recipients"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."key_storage_incident_recipients"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."key_storage_incident_recipients"(uuid) FROM PUBLIC, "anon", "authenticated";
