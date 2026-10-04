CREATE OR REPLACE FUNCTION public.claim_notification_delivery_attempts (
  p_limit integer DEFAULT 25
)
  RETURNS TABLE (
    id             uuid,
    event_id       uuid,
    destination_id uuid,
    attempts       integer,
    claim_token    uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_notification_delivery_claim_limit';
  end if;

  return query
  with candidates as (
    select attempt.id
    from public.notification_delivery_attempts attempt
    where (
      attempt.status in ('pending', 'retry')
      and attempt.next_attempt_at <= now()
    ) or (
      attempt.status = 'processing'
      and attempt.claimed_at < now() - interval '5 minutes'
    )
    order by attempt.created_at, attempt.id
    for update skip locked
    limit p_limit
  )
  update public.notification_delivery_attempts attempt
  set status = 'processing',
      claim_token = gen_random_uuid(),
      claimed_at = now(),
      updated_at = now()
  from candidates
  where attempt.id = candidates.id
  returning attempt.id, attempt.event_id, attempt.destination_id, attempt.attempts, attempt.claim_token;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_notification_delivery_attempts"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_notification_delivery_attempts"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_notification_delivery_attempts"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_notification_delivery_attempts"(integer) FROM PUBLIC, "anon", "authenticated";
