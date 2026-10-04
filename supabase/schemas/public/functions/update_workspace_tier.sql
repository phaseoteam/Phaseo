CREATE OR REPLACE FUNCTION public.update_workspace_tier (
  p_team_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
    v_current_tier text;
    v_new_tier text;
    v_prev_month_spend numeric(12, 2);
    v_consecutive_low integer;
    v_threshold numeric(12, 2) := 10000.00; -- $10k threshold
    v_changed boolean := false;
    v_reason text;
BEGIN
    -- Get current tier and consecutive low-spend months
    SELECT tier, consecutive_low_spend_months
    INTO v_current_tier, v_consecutive_low
    FROM public.teams
    WHERE id = p_team_id;

    IF v_current_tier IS NULL THEN
        RAISE EXCEPTION 'Team not found: %', p_team_id;
    END IF;

    -- Calculate previous month's spend
    v_prev_month_spend := calculate_team_previous_month_spend(p_team_id);

    -- Determine new tier based on logic:
    -- - If spent >$10k in previous month → Enterprise
    -- - If spent <$10k for 3 consecutive months → Basic
    IF v_prev_month_spend >= v_threshold THEN
        -- High spend → Enterprise tier
        v_new_tier := 'enterprise';
        v_consecutive_low := 0;
        IF v_current_tier != 'enterprise' THEN
            v_reason := format('Previous month spend $%s exceeded $10k threshold', v_prev_month_spend);
            v_changed := true;
        END IF;
    ELSE
        -- Low spend → increment counter
        v_consecutive_low := v_consecutive_low + 1;

        IF v_consecutive_low >= 3 AND v_current_tier != 'basic' THEN
            -- 3 months of low spend → downgrade to Basic
            v_new_tier := 'basic';
            v_reason := format('3 consecutive months below $10k threshold (current: $%s)', v_prev_month_spend);
            v_changed := true;
        ELSE
            -- Keep current tier
            v_new_tier := v_current_tier;
        END IF;
    END IF;

    -- Update team record
    UPDATE public.teams
    SET
        tier = v_new_tier,
        tier_updated_at = CASE WHEN v_changed THEN now() ELSE tier_updated_at END,
        consecutive_low_spend_months = v_consecutive_low
    WHERE id = p_team_id;

    -- Record tier change in history if changed
    IF v_changed THEN
        INSERT INTO public.team_tier_history (
            team_id,
            old_tier,
            new_tier,
            reason,
            previous_month_spend_usd,
            threshold_usd,
            consecutive_low_months
        ) VALUES (
            p_team_id,
            v_current_tier,
            v_new_tier,
            v_reason,
            v_prev_month_spend,
            v_threshold,
            v_consecutive_low
        );
    END IF;

    RETURN jsonb_build_object(
        'team_id', p_team_id,
        'old_tier', v_current_tier,
        'new_tier', v_new_tier,
        'changed', v_changed,
        'reason', v_reason,
        'previous_month_spend_usd', v_prev_month_spend,
        'consecutive_low_months', v_consecutive_low
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_workspace_tier"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_workspace_tier"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_workspace_tier"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_workspace_tier"(uuid) FROM PUBLIC, "anon", "authenticated";
