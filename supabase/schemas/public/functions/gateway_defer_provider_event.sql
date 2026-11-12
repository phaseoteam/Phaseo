CREATE OR REPLACE FUNCTION public.gateway_defer_provider_event (
  p_provider          text,
  p_provider_event_id text,
  p_reason            text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_next_attempt integer;
begin
  select attempt_count + 1 into v_next_attempt
  from public.gateway_provider_events
  where provider = p_provider and provider_event_id = p_provider_event_id
  for update;
  if not found then return; end if;

  update public.gateway_provider_events
  set attempt_count = v_next_attempt,
      last_error = left(coalesce(p_reason, 'provider_event_deferred'), 500),
      next_attempt_at = case
        when v_next_attempt >= 20 then null
        else now() + make_interval(secs => least(1800, 5 * (2 ^ least(v_next_attempt, 8))::integer))
      end,
      dead_lettered_at = case when v_next_attempt >= 20 then now() else dead_lettered_at end,
      processed_at = case when v_next_attempt >= 20 then now() else processed_at end,
      replay_locked_at = null,
      replay_locked_by = null,
      updated_at = now()
  where provider = p_provider and provider_event_id = p_provider_event_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_defer_provider_event"(text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_defer_provider_event"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_defer_provider_event"(text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_defer_provider_event"(text, text, text) FROM PUBLIC, "anon", "authenticated";
