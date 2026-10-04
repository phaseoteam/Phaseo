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

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_invite_role_policy"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_invite_role_policy"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_invite_role_policy"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_invite_role_policy"() FROM PUBLIC, "anon", "authenticated";
