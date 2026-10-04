CREATE OR REPLACE FUNCTION catalogue_private.record_row_history()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if TG_OP='UPDATE' and to_jsonb(OLD)=to_jsonb(NEW) then return NEW; end if;
  insert into public.v2_catalogue_row_history(table_name,model_slug,operation,actor_user_id,before_state,after_state)
  values(TG_TABLE_NAME,catalogue_private.history_model(coalesce(to_jsonb(NEW),to_jsonb(OLD))),TG_OP,nullif(current_setting('phaseo.catalogue_actor',true),'')::uuid,
    case when TG_OP<>'INSERT' then to_jsonb(OLD) end,case when TG_OP<>'DELETE' then to_jsonb(NEW) end);
  return coalesce(NEW,OLD);
end $function$;

REVOKE ALL ON FUNCTION "catalogue_private"."record_row_history"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "catalogue_private"."record_row_history"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "catalogue_private"."record_row_history"() TO "postgres";
