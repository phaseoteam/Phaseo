CREATE OR REPLACE FUNCTION private.enqueue_provider_health_refresh (
  p_date     date,
  p_model    text,
  p_provider text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into private.provider_health_refresh_queue (usage_date, model_slug, provider_model_id)
  select p_date, p_model, p_provider
  where p_date is not null and p_model is not null and p_provider is not null
  on conflict (usage_date, model_slug, provider_model_id) do update
    set generation = excluded.generation, requested_at = excluded.requested_at;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_provider_health_refresh"(date, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_provider_health_refresh"(date, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_provider_health_refresh"(date, text, text) TO "postgres";
