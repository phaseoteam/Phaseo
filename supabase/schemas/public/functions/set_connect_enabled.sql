CREATE OR REPLACE FUNCTION public.set_connect_enabled (
  p_workspace_id uuid,
  p_enabled      boolean,
  p_user_id      uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_subscription public.connect_subscriptions%rowtype;
begin
  if p_workspace_id is null or p_enabled is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  insert into public.connect_subscriptions (workspace_id, updated_by)
  values (p_workspace_id, p_user_id)
  on conflict (workspace_id) do nothing;

  -- The row lock serialises switching with charge_connect_month, which also
  -- opens and closes periods.
  select * into v_subscription from public.connect_subscriptions subscription
  where subscription.workspace_id = p_workspace_id
  for update;

  if v_subscription.enabled = p_enabled then
    return false;
  end if;

  if p_enabled then
    update public.connect_subscriptions subscription
    set enabled = true, enabled_at = now(), updated_by = p_user_id
    where subscription.workspace_id = p_workspace_id;
    -- While a month is unpaid no period opens, so no days are billed; paying it opens one.
    if not v_subscription.payment_due then
      insert into public.connect_subscription_periods (workspace_id, started_by)
      values (p_workspace_id, p_user_id);
    end if;
  else
    update public.connect_subscriptions subscription
    set enabled = false, disabled_at = now(), updated_by = p_user_id
    where subscription.workspace_id = p_workspace_id;
    update public.connect_subscription_periods period
    set ended_at = now(), ended_by = p_user_id, ended_reason = 'turned_off'
    where period.workspace_id = p_workspace_id and period.ended_at is null;
  end if;
  return true;
end;
$function$;

COMMENT ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) IS 'Turns Phaseo Connect on or off for a workspace and opens or closes its billing period. Returns whether anything changed. Turning it on while a month is unpaid records the choice but bills nothing until the month is paid.';

GRANT EXECUTE ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) FROM PUBLIC, "anon", "authenticated";
