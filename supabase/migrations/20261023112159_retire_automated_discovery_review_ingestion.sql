-- Restored from Phaseo Prod migration records; version 20261023112159, read back 2026-10-23.
-- phaseo:allow-production-history-backfill reason: Restore the already-applied discovery ingestion retirement so deployment history matches production without changing remote records.
create or replace function public.upsert_model_discovery_review_items(p_rows jsonb)
returns void
language plpgsql
set search_path to 'public'
as $function$
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'model discovery review rows must be a JSON array';
  end if;
  -- Discovery review ingestion is retired. Keep this successful no-op for
  -- deployed discovery workers so queue retirement cannot block Discord alerts.
  -- Historical review items/events are retained; new signals go to Discord.
  return;
end;
$function$;
comment on function public.upsert_model_discovery_review_items(jsonb) is
'Retired 2026-10-23: compatibility no-op for older discovery workers. Discovery changes are delivered to Discord; no new review items are persisted. Historical review records are retained.';
comment on table public.model_discovery_review_items is
'Historical automated discovery review queue. Ingestion retired 2026-10-23 in favor of Discord notifications. Separate provider catalog submission reviews remain active.';
