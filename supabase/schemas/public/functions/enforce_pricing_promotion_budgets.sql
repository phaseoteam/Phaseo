CREATE OR REPLACE FUNCTION public.enforce_pricing_promotion_budgets ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  promotion record;
  v_charged bigint;
  v_spent bigint;
  v_ended integer := 0;
begin
  for promotion in
    select *
    from public.v2_pricing_promotions
    where exhausted_at is null
      and starts_at <= now()
      -- Keep counting briefly after the end so late-recorded lines are included.
      and ends_at > now() - interval '1 hour'
    for update skip locked
  loop
    select coalesce(sum(line.charged_nanos), 0)
      into v_charged
    from public.v2_request_pricing_lines line
    where line.sku_id = any(promotion.sku_ids)
      and line.created_at >= promotion.starts_at;

    -- Charged lines are at the discounted price; convert back to list price.
    v_spent := ceil(v_charged::numeric * 10000 / (10000 - promotion.discount_bps))::bigint;

    update public.v2_pricing_promotions
    set spent_nanos = v_spent,
        checked_at = now(),
        updated_at = now()
    where promotion_id = promotion.promotion_id;

    if v_spent >= promotion.budget_nanos then
      update public.v2_pricing_skus
      set effective_to = now(),
          updated_at = now()
      where sku_id = any(promotion.sku_ids)
        and (effective_to is null or effective_to > now());

      update public.v2_pricing_promotions
      set exhausted_at = now(),
          updated_at = now()
      where promotion_id = promotion.promotion_id;

      v_ended := v_ended + 1;
    end if;
  end loop;

  return v_ended;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_pricing_promotion_budgets"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_pricing_promotion_budgets"() FROM PUBLIC, "anon", "authenticated";
