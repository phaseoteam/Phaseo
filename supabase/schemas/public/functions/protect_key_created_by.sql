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

REVOKE ALL ON FUNCTION "public"."protect_key_created_by"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_key_created_by"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_key_created_by"() FROM PUBLIC, "anon", "authenticated", "service_role";
