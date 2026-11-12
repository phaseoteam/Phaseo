CREATE OR REPLACE FUNCTION public.gateway_claim_provider_event (
  p_provider          text,
  p_provider_event_id text,
  p_worker_id         text    DEFAULT 'batch-provider-webhook'::text,
  p_lease_seconds     integer DEFAULT 120
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_claimed integer;
begin
  update public.gateway_provider_events event
  set replay_locked_at = now(),
      replay_locked_by = left(coalesce(nullif(trim(p_worker_id), ''), 'batch-provider-webhook'), 200),
      updated_at = now()
  where event.provider = nullif(trim(p_provider), '')
    and event.provider_event_id = nullif(trim(p_provider_event_id), '')
    and event.processed_at is null
    and event.dead_lettered_at is null
    and (event.next_attempt_at is null or event.next_attempt_at <= now())
    and (
      event.replay_locked_at is null
      or event.replay_locked_at < now() - make_interval(
        secs => greatest(30, least(coalesce(p_lease_seconds, 120), 3600))
      )
    );

  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_claim_provider_event"(text, text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_claim_provider_event"(text, text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_claim_provider_event"(text, text, text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_claim_provider_event"(text, text, text, integer) FROM PUBLIC, "anon", "authenticated";
