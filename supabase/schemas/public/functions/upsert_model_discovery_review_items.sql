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

GRANT EXECUTE ON FUNCTION "public"."upsert_model_discovery_review_items"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_model_discovery_review_items"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."upsert_model_discovery_review_items"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."upsert_model_discovery_review_items"(jsonb) FROM PUBLIC, "anon", "authenticated";
