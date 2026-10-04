CREATE OR REPLACE FUNCTION public.upsert_model_discovery_review_items (
  p_rows jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'model discovery review rows must be a JSON array';
  end if;

  insert into public.model_discovery_review_items (
    dedupe_key,
    run_id,
    source,
    provider_id,
    provider_name,
    model_id,
    change_type,
    details,
    last_detected_at
  )
  select
    nullif(trim(entry->>'dedupe_key'), ''),
    nullif(trim(entry->>'run_id'), '')::uuid,
    entry->>'source',
    entry->>'provider_id',
    entry->>'provider_name',
    entry->>'model_id',
    entry->>'change_type',
    case when jsonb_typeof(entry->'details') = 'object' then entry->'details' else '{}'::jsonb end,
    coalesce(nullif(trim(entry->>'last_detected_at'), '')::timestamptz, now())
  from jsonb_array_elements(p_rows) as entries(entry)
  where nullif(trim(entry->>'dedupe_key'), '') is not null
  on conflict (dedupe_key) do update set
    run_id = excluded.run_id,
    source = excluded.source,
    provider_id = excluded.provider_id,
    provider_name = excluded.provider_name,
    model_id = excluded.model_id,
    change_type = excluded.change_type,
    details = excluded.details,
    last_detected_at = excluded.last_detected_at;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."upsert_model_discovery_review_items"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_model_discovery_review_items"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."upsert_model_discovery_review_items"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."upsert_model_discovery_review_items"(jsonb) FROM PUBLIC, "anon", "authenticated";
