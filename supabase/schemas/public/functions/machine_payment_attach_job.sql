CREATE OR REPLACE FUNCTION public.machine_payment_attach_job (
  p_authorization_id uuid,
  p_job_kind         text,
  p_job_id           text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if p_job_kind not in ('video','batch') or nullif(trim(p_job_id),'') is null then raise exception 'invalid_job'; end if;
  update public.machine_payment_authorizations set job_kind=p_job_kind, job_id=p_job_id, status='executing'
  where id=p_authorization_id and status in ('claimed','executing') and (job_id is null or (job_kind=p_job_kind and job_id=p_job_id));
  if not found then raise exception 'authorization_job_conflict'; end if;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."machine_payment_attach_job"(uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."machine_payment_attach_job"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."machine_payment_attach_job"(uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."machine_payment_attach_job"(uuid, text, text) FROM PUBLIC, "anon", "authenticated";
