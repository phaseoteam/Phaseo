CREATE OR REPLACE FUNCTION public.create_workload_identity_policy (
  p_workspace_id               uuid,
  p_created_by                 uuid,
  p_name                       text,
  p_provider                   text,
  p_issuer                     text,
  p_pinned_owner_id            text,
  p_audiences                  text[],
  p_claim_conditions           jsonb,
  p_max_token_lifetime_seconds integer
)
  RETURNS TABLE (policy_id uuid, key_id uuid)
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  new_key_id uuid;
begin
  -- The key row has no usable secret: its hash is random and never shown, and
  -- the gateway refuses workload_identity keys presented as API keys.
  insert into public.keys (
    workspace_id, name, hash, prefix, status, scopes, created_by, kid, key_kind, issued_via
  ) values (
    p_workspace_id, p_name, 'workload_identity:' || gen_random_uuid()::text, 'oidc', 'active', '[]', p_created_by,
    replace(gen_random_uuid()::text, '-', ''), 'workload_identity', 'workload_identity'
  )
  returning id into new_key_id;

  return query
  insert into public.workload_identity_policies as policy (
    workspace_id, key_id, name, provider, issuer, pinned_owner_id, audiences, claim_conditions,
    max_token_lifetime_seconds, created_by
  ) values (
    p_workspace_id, new_key_id, p_name, p_provider, p_issuer, p_pinned_owner_id, p_audiences,
    coalesce(p_claim_conditions, '{}'::jsonb), coalesce(p_max_token_lifetime_seconds, 43200), p_created_by
  )
  returning policy.id, policy.key_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text[], jsonb, integer) TO "service_role";

COMMENT ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text[], jsonb, integer) IS 'Creates a workload identity trust policy together with the secretless keys row it authenticates as. The caller must already have checked that p_created_by is a workspace admin and validated the policy.';

REVOKE ALL ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text[], jsonb, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text[], jsonb, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text[], jsonb, integer) FROM PUBLIC, "anon", "authenticated";
