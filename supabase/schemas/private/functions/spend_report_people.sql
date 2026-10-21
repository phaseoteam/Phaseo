CREATE OR REPLACE FUNCTION private.spend_report_people (
  p_workspace_id   uuid,
  p_include_admins boolean
)
  RETURNS TABLE (
    user_id uuid,
    role    text,
    email   text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Who a workspace's spend report is for: the owner and every member with the owner role, plus
  -- members with the admin role when p_include_admins. One row per person (owner wins over admin),
  -- with their sign-in email, or null when they have none. Unsubscribes are applied by the caller.
  select distinct on (person.user_id) person.user_id, person.role, nullif(btrim(account.email), '')
  from (
    select workspace.owner_user_id as user_id, 'owner' as role, 0 as rank
    from public.workspaces workspace
    where workspace.id = p_workspace_id and workspace.owner_user_id is not null
    union all
    select member.user_id, member.role::text, case when member.role::text = 'owner' then 0 else 1 end
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and (member.role::text = 'owner' or (p_include_admins and member.role::text = 'admin'))
  ) person
  left join auth.users account on account.id = person.user_id
  order by person.user_id, person.rank;
$function$;

COMMENT ON FUNCTION "private"."spend_report_people"(uuid, boolean) IS 'The owner and owner-role members of a workspace, plus admins when p_include_admins, with their emails: who its spend report is emailed to (before unsubscribes).';

REVOKE ALL ON FUNCTION "private"."spend_report_people"(uuid, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_report_people"(uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_people"(uuid, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_people"(uuid, boolean) TO "service_role";
