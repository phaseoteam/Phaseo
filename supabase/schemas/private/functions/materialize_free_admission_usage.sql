CREATE OR REPLACE FUNCTION private.materialize_free_admission_usage()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
    admission jsonb := new.detail_metadata #> '{routing_diagnostics,freeQuota}';
    owner uuid;
    day date;
    used integer;
begin
    if admission is null or admission ->> 'admitted' is distinct from 'true' then return new; end if;
    -- Audit metadata is advisory. Invalid reporting must not break request audit.
    begin
        owner := (admission ->> 'ownerId')::uuid;
        day := (admission ->> 'utcDay')::date;
        used := (admission ->> 'used')::integer;
    exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
        return new;
    end;
    if owner is null or day is null or used is null or used not between 1 and 1500 then return new; end if;
    -- Cumulative admission sequence makes duplicate and out-of-order audit delivery
    -- idempotent and recovers earlier missing audit events on the next delivery.
    insert into public.free_model_usage_daily(owner_id, usage_date, included_requests)
    values (owner, day, used)
    on conflict (owner_id, usage_date) do update
      set included_requests = excluded.included_requests, updated_at = now()
      where public.free_model_usage_daily.included_requests < excluded.included_requests;
    return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."materialize_free_admission_usage"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."materialize_free_admission_usage"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."materialize_free_admission_usage"() TO "postgres";
