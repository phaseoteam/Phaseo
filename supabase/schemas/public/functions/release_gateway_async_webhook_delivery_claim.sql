CREATE OR REPLACE FUNCTION public.release_gateway_async_webhook_delivery_claim (
  p_workspace_id uuid,
  p_kind         text,
  p_internal_id  text,
  p_delivery_key text,
  p_claim_token  text
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with changed as (
    update public.gateway_async_webhook_deliveries
    set status = 'pending', claim_token = null, claimed_at = null, updated_at = now()
    where workspace_id = p_workspace_id and kind = p_kind
      and internal_id = p_internal_id and delivery_key = p_delivery_key
      and status = 'claimed' and claim_token = p_claim_token
    returning 1
  ) select exists(select 1 from changed);
$function$;

GRANT EXECUTE ON FUNCTION "public"."release_gateway_async_webhook_delivery_claim"(uuid, text, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."release_gateway_async_webhook_delivery_claim"(uuid, text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."release_gateway_async_webhook_delivery_claim"(uuid, text, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."release_gateway_async_webhook_delivery_claim"(uuid, text, text, text, text) FROM PUBLIC, "anon", "authenticated";
