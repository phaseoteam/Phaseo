CREATE OR REPLACE FUNCTION private.enqueue_v2_analytics_correction (
  p_request_event_id uuid
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into public.v2_analytics_outbox as outbox
    (request_event_id,workspace_id,occurred_at,status,attempt_count,available_at,last_error,updated_at)
  select request_event_id,workspace_id,occurred_at,'pending',0,now(),null,now()
  from public.v2_request_facts where request_event_id=p_request_event_id and coalesce(current_setting('phaseo.pruning_byok_metadata', true), '') <> 'on'
  on conflict(request_event_id) do update set workspace_id=excluded.workspace_id,
    occurred_at=excluded.occurred_at,status='pending',attempt_count=0,
    available_at=now(),last_error=null,updated_at=now()
  where outbox.status<>'pending' or outbox.workspace_id is distinct from excluded.workspace_id
    or outbox.occurred_at is distinct from excluded.occurred_at;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_v2_analytics_correction"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_v2_analytics_correction"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_v2_analytics_correction"(uuid) TO "postgres";
