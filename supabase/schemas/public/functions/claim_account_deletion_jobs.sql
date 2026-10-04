CREATE OR REPLACE FUNCTION public.claim_account_deletion_jobs (
  p_limit         integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
  RETURNS SETOF public.account_deletion_jobs
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  return query
  with candidates as (
    select job.id
    from public.account_deletion_jobs as job
    where job.status in ('pending', 'purging', 'failed')
      and job.next_attempt_at <= now()
      and (job.lease_expires_at is null or job.lease_expires_at <= now())
      and job.completed_at is null
    order by job.deadline_at asc, job.next_attempt_at asc, job.requested_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 25))
  )
  update public.account_deletion_jobs as job
  set status = 'purging',
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 900))),
      last_attempt_at = now(),
      attempts = job.attempts + 1,
      last_error = null,
      updated_at = now()
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_account_deletion_jobs"(integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_account_deletion_jobs"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_account_deletion_jobs"(integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_account_deletion_jobs"(integer, integer) FROM PUBLIC, "anon", "authenticated";
