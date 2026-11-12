CREATE OR REPLACE FUNCTION public.gateway_claim_workspace_publications (
  p_limit        integer DEFAULT 25,
  p_workspace_id uuid    DEFAULT NULL::uuid
)
  RETURNS TABLE (
    workspace_id uuid,
    revision     uuid,
    lease_id     uuid
  )
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_publication_limit' using errcode='22023';
  end if;
  -- The existing authenticated explicit-invalidation route can also request
  -- publication when there was no preceding mutation. A busy lease is not stolen.
  if p_workspace_id is not null then
    insert into public.gateway_workspace_publications (workspace_id)
      select w.id from public.workspaces w where w.id = p_workspace_id
      on conflict on constraint gateway_workspace_publications_pkey do nothing;
  end if;
  return query
  with due as (
    select p.workspace_id from public.gateway_workspace_publications p
    where p.attempts < 10 and p.available_at <= clock_timestamp()
      and (p.lease_until is null or p.lease_until <= clock_timestamp())
      and (p_workspace_id is null or p.workspace_id = p_workspace_id)
    order by p.available_at, p.workspace_id limit p_limit for update skip locked
  )
  update public.gateway_workspace_publications p set
    lease_id = gen_random_uuid(), lease_until = clock_timestamp() + interval '3 minutes',
    attempts = p.attempts + 1
  from due where p.workspace_id = due.workspace_id
  returning p.workspace_id, p.revision, p.lease_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_claim_workspace_publications"(integer, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_claim_workspace_publications"(integer, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_claim_workspace_publications"(integer, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_claim_workspace_publications"(integer, uuid) FROM PUBLIC, "anon", "authenticated";
