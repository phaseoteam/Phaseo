CREATE OR REPLACE FUNCTION private.guard_model_replacement_cycle()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_current text := new.replacement_model_slug;
  v_depth integer := 0;
begin
  -- Serialise successor edits so two concurrent writes cannot close a loop
  -- that neither sees on its own.
  perform pg_advisory_xact_lock(hashtext('v2_models.replacement_model_slug'));
  while v_current is not null loop
    if v_current = new.model_slug then
      raise exception 'recommended successor % would loop back to %', new.replacement_model_slug, new.model_slug
        using errcode = '23514';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 32 then
      raise exception 'recommended successor chain from % is longer than 32 models', new.model_slug
        using errcode = '23514';
    end if;
    select model.replacement_model_slug into v_current
    from public.v2_models model
    where model.model_slug = v_current;
  end loop;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."guard_model_replacement_cycle"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."guard_model_replacement_cycle"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."guard_model_replacement_cycle"() TO "postgres";
