-- Stop recording UPDATEs that only move updated_at in v2_catalogue_row_history.
-- The hourly Artificial Analysis publish and the Epoch / progress-index syncs upsert every
-- benchmark result with a fresh updated_at, so the trigger stored a full before/after copy of
-- rows whose data did not change. Over the last 7 days 18,587 of 22,465 v2_benchmark_results
-- history rows (83%) were such updated_at-only rewrites. Rows that change any other column,
-- inserts and deletes are still recorded in full, including their updated_at.
-- Only the trigger guard changes here; the upserts themselves are left as they are.

CREATE OR REPLACE FUNCTION catalogue_private.record_row_history()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if TG_OP='UPDATE' and (to_jsonb(OLD) - 'updated_at')=(to_jsonb(NEW) - 'updated_at') then return NEW; end if;
  insert into public.v2_catalogue_row_history(table_name,model_slug,operation,actor_user_id,before_state,after_state)
  values(TG_TABLE_NAME,catalogue_private.history_model(coalesce(to_jsonb(NEW),to_jsonb(OLD))),TG_OP,nullif(current_setting('phaseo.catalogue_actor',true),'')::uuid,
    case when TG_OP<>'INSERT' then to_jsonb(OLD) end,case when TG_OP<>'DELETE' then to_jsonb(NEW) end);
  return coalesce(NEW,OLD);
end $function$;
