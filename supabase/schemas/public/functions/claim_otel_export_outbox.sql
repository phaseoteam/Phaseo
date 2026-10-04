CREATE OR REPLACE FUNCTION public.claim_otel_export_outbox (
  p_limit integer DEFAULT 100
)
  RETURNS SETOF public.otel_export_outbox
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  return query
  with candidates as (
    select id
    from public.otel_export_outbox
    where (
      status = 'pending'
      or (status = 'processing' and lease_expires_at < now())
    )
      and next_attempt_at <= now()
    order by next_attempt_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ),
  claimed as (
    update public.otel_export_outbox outbox
    set status = 'processing',
        attempts = attempts + 1,
        lease_expires_at = now() + interval '15 minutes',
        updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select * from claimed;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_otel_export_outbox"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_otel_export_outbox"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_otel_export_outbox"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_otel_export_outbox"(integer) FROM PUBLIC, "anon", "authenticated";
