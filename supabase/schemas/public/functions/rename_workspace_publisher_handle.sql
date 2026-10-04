CREATE OR REPLACE FUNCTION public.rename_workspace_publisher_handle (
  target_workspace_id uuid,
  actor_user_id       uuid,
  requested_handle    text
)
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  workspace_row public.workspaces%rowtype;
  normalized_handle text := lower(trim(requested_handle));
begin
  if normalized_handle !~ '^[a-z0-9][a-z0-9_-]{2,39}$' then
    raise exception 'invalid_publisher_handle';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;
  if not found then raise exception 'workspace_not_found'; end if;

  if workspace_row.owner_user_id <> actor_user_id and not exists (
    select 1 from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = actor_user_id
      and member.role in ('owner', 'admin')
  ) then
    raise exception 'publisher_handle_forbidden';
  end if;

  if normalized_handle = workspace_row.publisher_handle then
    return normalized_handle;
  end if;

  if exists (
    select 1 from public.workspaces workspace
    where lower(workspace.publisher_handle) = normalized_handle
      and workspace.id <> target_workspace_id
  ) or exists (
    select 1 from public.workspace_publisher_handle_aliases alias
    where alias.handle = normalized_handle
      and alias.workspace_id <> target_workspace_id
  ) then
    raise exception 'publisher_handle_reserved' using errcode = '23505';
  end if;

  insert into public.workspace_publisher_handle_aliases (handle, workspace_id)
  values (workspace_row.publisher_handle, target_workspace_id)
  on conflict (handle) do nothing;

  delete from public.workspace_publisher_handle_aliases
  where workspace_id = target_workspace_id and handle = normalized_handle;

  update public.workspaces
  set publisher_handle = normalized_handle
  where id = target_workspace_id;

  return normalized_handle;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."rename_workspace_publisher_handle"(uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rename_workspace_publisher_handle"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rename_workspace_publisher_handle"(uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."rename_workspace_publisher_handle"(uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";
