CREATE OR REPLACE FUNCTION public.gateway_claim_provider_events (
  p_providers     text[],
  p_limit         integer DEFAULT 100,
  p_worker_id     text    DEFAULT 'batch-provider-event-replay'::text,
  p_lease_seconds integer DEFAULT 120
)
  RETURNS SETOF public.gateway_provider_events
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  return query
  with candidates as (
    select event.id
    from public.gateway_provider_events event
    where event.provider = any(p_providers)
      and event.processed_at is null
      and event.dead_lettered_at is null
      and (event.next_attempt_at is null or event.next_attempt_at <= now())
      and (
        event.replay_locked_at is null
        or event.replay_locked_at < now() - make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 3600)))
      )
    order by event.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  update public.gateway_provider_events event
  set replay_locked_at = now(),
      replay_locked_by = left(coalesce(nullif(trim(p_worker_id), ''), 'batch-provider-event-replay'), 200),
      updated_at = now()
  from candidates
  where event.id = candidates.id
  returning event.*;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_claim_provider_events"(text[], integer, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_claim_provider_events"(text[], integer, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_claim_provider_events"(text[], integer, text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_claim_provider_events"(text[], integer, text, integer) FROM PUBLIC, "anon", "authenticated";
