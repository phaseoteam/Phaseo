SET local check_function_bodies = off;

-- Trusted workloads phase 2: GitLab, Google Cloud, Buildkite, CircleCI and AWS
-- presets, plus custom issuers (Kubernetes, Bitbucket, self-managed GitLab...)
-- whose policies name the claim their owner is pinned to.

ALTER TABLE "public"."workload_identity_policies" ADD COLUMN "pinned_claim" text;

ALTER TABLE "public"."workload_identity_policies" DROP CONSTRAINT "workload_identity_policies_provider_check";

ALTER TABLE "public"."workload_identity_policies" ADD CONSTRAINT "workload_identity_policies_provider_check" CHECK ((provider = ANY (ARRAY['vercel'::text, 'github_actions'::text, 'gitlab'::text, 'google_cloud'::text, 'buildkite'::text, 'circleci'::text, 'aws'::text, 'custom'::text])));

ALTER TABLE "public"."workload_identity_policies" ADD CONSTRAINT "workload_identity_policies_pinned_claim_check" CHECK (((provider = 'custom'::text) = ((pinned_claim IS NOT NULL) AND (char_length(pinned_claim) >= 1) AND (char_length(pinned_claim) <= 128))));

COMMENT ON TABLE "public"."workload_identity_policies" IS 'Trust policies that let a workload authenticate to the gateway with a short-lived OIDC token from a deployment, CI or cloud platform (Vercel, GitHub Actions, GitLab, Google Cloud, Buildkite, CircleCI, AWS) or a workspace''s own OIDC issuer (provider custom) instead of an API key. Each policy owns one keys row (key_kind workload_identity, no usable secret) so limits, budgets, logs and billing use the normal key paths. pinned_owner_id is the immutable owner ID the token must carry in the provider''s fixed claim (Vercel owner_id, GitHub repository_owner_id, GitLab project_id, Google sub, Buildkite organization_id, CircleCI oidc.circleci.com/org-id, AWS sub) or, for custom issuers, in the claim named by pinned_claim; claim_conditions adds exact-match conditions on other claims. Tokens must be issued for the audience https://api.phaseo.app.';

-- New overload with p_pinned_claim. The 8-argument version stays so gateway
-- versions deployed before this one keep working during the rollout.
CREATE OR REPLACE FUNCTION public.create_workload_identity_policy (
  p_workspace_id               uuid,
  p_created_by                 uuid,
  p_name                       text,
  p_provider                   text,
  p_issuer                     text,
  p_pinned_claim               text,
  p_pinned_owner_id            text,
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
  -- Serialise creates per workspace so concurrent requests cannot both pass
  -- the policy cap.
  perform pg_advisory_xact_lock(hashtextextended('workload_identity_policy:' || p_workspace_id::text, 0));
  if (select count(*) from public.workload_identity_policies p where p.workspace_id = p_workspace_id) >= 50 then
    raise exception 'workload_identity_policy_limit' using errcode = 'P0001';
  end if;

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
    workspace_id, key_id, name, provider, issuer, pinned_claim, pinned_owner_id, claim_conditions,
    max_token_lifetime_seconds, created_by
  ) values (
    p_workspace_id, new_key_id, p_name, p_provider, p_issuer, p_pinned_claim, p_pinned_owner_id,
    coalesce(p_claim_conditions, '{}'::jsonb), coalesce(p_max_token_lifetime_seconds, 43200), p_created_by
  )
  returning policy.id, policy.key_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text, jsonb, integer) TO "service_role";

COMMENT ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text, jsonb, integer) IS 'Creates a workload identity trust policy together with the secretless keys row it authenticates as. p_pinned_claim names the claim the owner is pinned to and is set only for custom issuers (presets use a fixed claim). Raises workload_identity_policy_limit when the workspace already has 50 policies; creates for one workspace are serialised so the cap holds under concurrency. The caller must already have checked that p_created_by is a workspace admin and validated the policy.';

REVOKE ALL ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text, jsonb, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text, jsonb, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_workload_identity_policy"(uuid, uuid, text, text, text, text, text, jsonb, integer) FROM PUBLIC, "anon", "authenticated";
