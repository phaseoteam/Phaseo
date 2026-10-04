CREATE OR REPLACE FUNCTION public.wallet_apply_delta (
  p_workspace_id uuid,
  p_delta_nanos  bigint
)
  RETURNS TABLE (
    before_balance_nanos bigint,
    after_balance_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    v_before bigint;
    v_after bigint;
begin
    if p_workspace_id is null then
        raise exception 'missing_workspace_id';
    end if;

    update public.wallets
    set balance_nanos = balance_nanos + p_delta_nanos,
        updated_at = now()
    where workspace_id = p_workspace_id
    returning balance_nanos - p_delta_nanos, balance_nanos
    into v_before, v_after;

    if not found then
        raise exception 'wallet_not_found';
    end if;

    return query select v_before, v_after;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."wallet_apply_delta"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."wallet_apply_delta"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."wallet_apply_delta"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."wallet_apply_delta"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";
