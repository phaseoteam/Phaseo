CREATE OR REPLACE FUNCTION public.claim_payment_method_mutation (
  p_workspace_id uuid,
  p_claim_token  uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  claimed uuid;
begin
  insert into public.payment_method_mutation_leases (workspace_id, claim_token, expires_at, updated_at)
  values (p_workspace_id, p_claim_token, now() + interval '10 minutes', now())
  on conflict (workspace_id) do update
    set claim_token = excluded.claim_token,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.payment_method_mutation_leases.expires_at <= now()
  returning claim_token into claimed;
  return claimed = p_claim_token;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_payment_method_mutation"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_payment_method_mutation"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_payment_method_mutation"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_payment_method_mutation"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";
