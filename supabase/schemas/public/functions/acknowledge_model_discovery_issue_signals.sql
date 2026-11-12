CREATE OR REPLACE FUNCTION public.acknowledge_model_discovery_issue_signals (
  p_entries jsonb
)
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with acknowledged as (
    update public.model_discovery_issue_signals signal
    set emitted_at = now()
    where signal.action = 'delete'
      and signal.emitted_at is null
      and exists (
        select 1
        from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) entry(value)
        where entry.value ->> 'source' = signal.source
          and entry.value ->> 'providerId' = signal.provider_id
          and entry.value ->> 'action' = signal.action
          and entry.value ->> 'modelId' = signal.model_id
      )
    returning 1
  )
  select count(*)::integer from acknowledged;
$function$;

GRANT EXECUTE ON FUNCTION "public"."acknowledge_model_discovery_issue_signals"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."acknowledge_model_discovery_issue_signals"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."acknowledge_model_discovery_issue_signals"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."acknowledge_model_discovery_issue_signals"(jsonb) FROM PUBLIC, "anon", "authenticated";
