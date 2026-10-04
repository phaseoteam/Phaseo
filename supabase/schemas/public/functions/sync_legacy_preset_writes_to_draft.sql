CREATE OR REPLACE FUNCTION public.sync_legacy_preset_writes_to_draft()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if new.name is distinct from old.name and old.draft_name is not distinct from old.name then new.draft_name := new.name; end if;
  if new.slug is distinct from old.slug and old.draft_slug is not distinct from old.slug then new.draft_slug := new.slug; end if;
  if new.description is distinct from old.description and old.draft_description is not distinct from old.description then new.draft_description := new.description; end if;
  if new.config is distinct from old.config and old.draft_config is not distinct from old.config then new.draft_config := new.config; end if;
  if new.visibility is distinct from old.visibility and old.draft_visibility is not distinct from old.visibility then new.draft_visibility := new.visibility; end if;
  return new;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."sync_legacy_preset_writes_to_draft"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_legacy_preset_writes_to_draft"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_legacy_preset_writes_to_draft"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_legacy_preset_writes_to_draft"() FROM PUBLIC, "anon", "authenticated";
