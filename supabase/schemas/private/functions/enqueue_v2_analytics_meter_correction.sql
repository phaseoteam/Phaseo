CREATE OR REPLACE FUNCTION private.enqueue_v2_analytics_meter_correction()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op<>'INSERT' then perform private.enqueue_v2_analytics_correction(old.request_event_id); end if;
  if tg_op<>'DELETE' then
    if tg_op='INSERT' or new.request_event_id is distinct from old.request_event_id then
      perform private.enqueue_v2_analytics_correction(new.request_event_id);
    end if;
    return new;
  end if;
  return old;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_v2_analytics_meter_correction"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_v2_analytics_meter_correction"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_v2_analytics_meter_correction"() TO "postgres";
