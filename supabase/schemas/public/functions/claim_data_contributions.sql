CREATE OR REPLACE FUNCTION public.claim_data_contributions (
  p_limit         integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 300
)
  RETURNS SETOF public.data_contributions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  return query
  with candidates as (
    select contribution.id
    from public.data_contributions contribution
    where contribution.status in ('pending', 'failed', 'processing')
      and case
        when contribution.status = 'processing' then contribution.lease_expires_at
        else contribution.available_at
      end <= now()
      and contribution.retention_until > now()
    order by
      case
        when contribution.status = 'processing' then contribution.lease_expires_at
        else contribution.available_at
      end,
      contribution.occurred_at,
      contribution.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 250))
  )
  update public.data_contributions contribution
  set status = 'processing',
      attempt_count = contribution.attempt_count + 1,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 3600))),
      updated_at = now()
  from candidates
  where contribution.id = candidates.id
  returning contribution.*;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_data_contributions"(integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_data_contributions"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_data_contributions"(integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_data_contributions"(integer, integer) FROM PUBLIC, "anon", "authenticated";
