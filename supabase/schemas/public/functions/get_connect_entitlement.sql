CREATE OR REPLACE FUNCTION public.get_connect_entitlement (
  p_workspace_id uuid
)
  RETURNS TABLE (
    enabled boolean,
    paid_up boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- For the Connect relay: paid_up needs every finished month paid and a
  -- positive available balance (reserved gateway spend excluded).
  select coalesce(subscription.enabled, false),
    coalesce(not subscription.payment_due, false)
      and coalesce(wallet.balance_nanos - wallet.reserved_nanos > 0, false)
  from (select p_workspace_id as workspace_id) target
  left join public.connect_subscriptions subscription on subscription.workspace_id = target.workspace_id
  left join public.wallets wallet on wallet.workspace_id = target.workspace_id;
$function$;

COMMENT ON FUNCTION "public"."get_connect_entitlement"(uuid) IS 'Whether the Phaseo Connect relay may serve a workspace: enabled (the switch is on) and paid_up (no unpaid month and a positive available credit balance).';

GRANT EXECUTE ON FUNCTION "public"."get_connect_entitlement"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_connect_entitlement"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_connect_entitlement"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_connect_entitlement"(uuid) FROM PUBLIC, "anon", "authenticated";
