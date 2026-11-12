CREATE OR REPLACE FUNCTION public.release_payment_method_mutation (
  p_workspace_id uuid,
  p_claim_token  uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  with deleted as (
    delete from public.payment_method_mutation_leases
    where workspace_id = p_workspace_id and claim_token = p_claim_token
    returning workspace_id
  )
  select exists(select 1 from deleted);
$function$;

GRANT EXECUTE ON FUNCTION "public"."release_payment_method_mutation"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."release_payment_method_mutation"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."release_payment_method_mutation"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."release_payment_method_mutation"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";
