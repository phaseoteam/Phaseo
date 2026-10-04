CREATE OR REPLACE FUNCTION public.update_workspace_auto_top_up (
  p_workspace_id            uuid,
  p_enabled                 boolean,
  p_balance_threshold_nanos bigint,
  p_amount_nanos            bigint,
  p_payment_method_id       text,
  p_mfa_enabled             boolean,
  p_mfa_bypass_acknowledged boolean,
  p_mfa_bypass_phrase       text,
  p_actor_user_id           uuid    DEFAULT NULL::uuid,
  p_request_id              text    DEFAULT NULL::text
)
  RETURNS SETOF public.wallets
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_requires_mfa boolean;
begin
  if p_workspace_id is null then
    raise exception 'missing_workspace_id';
  end if;

  select *
  into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  v_requires_mfa := p_enabled
    and not coalesce(p_mfa_enabled, false)
    and not coalesce(v_wallet.auto_top_up_enabled, false);

  if v_requires_mfa
    and not (
      coalesce(p_mfa_bypass_acknowledged, false)
      and coalesce(p_mfa_bypass_phrase, '') = 'I ACCEPT THE RISK'
    ) then
    raise exception 'mfa_required';
  end if;

  update public.wallets
  set auto_top_up_enabled = p_enabled,
      low_balance_threshold = case when p_enabled then coalesce(p_balance_threshold_nanos, 0) else 0 end,
      auto_top_up_amount = case when p_enabled then coalesce(p_amount_nanos, 0) else 0 end,
      auto_top_up_account_id = case when p_enabled then p_payment_method_id else null end,
      updated_at = now()
  where workspace_id = p_workspace_id;

  if v_requires_mfa then
    insert into public.workspace_audit_events (
      workspace_id,
      actor_user_id,
      action,
      target_type,
      target_id,
      metadata,
      request_id
    ) values (
      p_workspace_id,
      p_actor_user_id,
      'auto_top_up.enabled_without_mfa',
      'wallet',
      p_workspace_id::text,
      jsonb_build_object('consentVersion', 'mfa-bypass-v1', 'mfaEnabled', false),
      nullif(left(trim(coalesce(p_request_id, '')), 200), '')
    );
  end if;

  return query
  select updated_wallet.*
  from public.wallets as updated_wallet
  where updated_wallet.workspace_id = p_workspace_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_workspace_auto_top_up"(uuid, boolean, bigint, bigint, text, boolean, boolean, text, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_workspace_auto_top_up"(uuid, boolean, bigint, bigint, text, boolean, boolean, text, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_workspace_auto_top_up"(uuid, boolean, bigint, bigint, text, boolean, boolean, text, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_workspace_auto_top_up"(uuid, boolean, bigint, bigint, text, boolean, boolean, text, uuid, text) FROM PUBLIC, "anon", "authenticated";
