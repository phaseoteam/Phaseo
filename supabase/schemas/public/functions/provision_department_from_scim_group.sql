CREATE OR REPLACE FUNCTION public.provision_department_from_scim_group()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  department_row public.workspace_departments;
  selected_color text;
begin
  selected_color := case substring(md5(new.id::text),1,1)
    when '0' then 'blue' when '1' then 'cyan' when '2' then 'emerald'
    when '3' then 'amber' when '4' then 'orange' when '5' then 'rose'
    when '6' then 'violet' when '7' then 'fuchsia' else 'slate' end;

  insert into public.workspace_departments(
    workspace_id,name,icon,color,source_type,source_id,directory_name
  ) values (
    new.workspace_id,new.display_name,'users',selected_color,'scim_group',new.id,new.display_name
  )
  on conflict (workspace_id,source_type,source_id) where source_id is not null
  do update set
    directory_name=excluded.directory_name,
    name=case when public.workspace_departments.name_overridden then public.workspace_departments.name else excluded.directory_name end,
    updated_at=now()
  returning * into department_row;

  insert into public.scim_group_mappings(
    workspace_id,scim_group_id,department_id,access_role,department_position
  ) values (
    new.workspace_id,new.id,department_row.id,'member','member'
  ) on conflict (scim_group_id,department_id) do nothing;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."provision_department_from_scim_group"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."provision_department_from_scim_group"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."provision_department_from_scim_group"() FROM PUBLIC, "anon", "authenticated", "service_role";
