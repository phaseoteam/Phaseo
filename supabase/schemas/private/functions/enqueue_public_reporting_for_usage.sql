CREATE OR REPLACE FUNCTION private.enqueue_public_reporting_for_usage()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op <> 'INSERT' then
    perform private.enqueue_public_reporting_refresh(f.occurred_at)
    from public.v2_request_facts f where f.request_event_id = old.request_event_id;
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'INSERT' or new.request_event_id is distinct from old.request_event_id then
      perform private.enqueue_public_reporting_refresh(f.occurred_at)
      from public.v2_request_facts f where f.request_event_id = new.request_event_id;
    end if;
    return new;
  end if;
  return old;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_public_reporting_for_usage"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_public_reporting_for_usage"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_public_reporting_for_usage"() TO "postgres";
