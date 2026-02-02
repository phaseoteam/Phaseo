-- ============================================================================
-- TWO-TIER PRICING SYSTEM WITH ROLLING 30-DAY CALCULATION
-- Purpose: Simplified pricing with real-time tier management
-- Basic: 7% markup | Enterprise: 5% markup
--
-- HOW IT WORKS:
-- - Tier is calculated BEFORE each request based on rolling 30-day spend
-- - If last 30 days >= $10k → Enterprise (5% fee)
-- - If last 30 days < $10k → Basic (7% fee)
-- - Grace Period: Enterprise teams get 3 consecutive checks before downgrade
-- - No monthly cron needed - tier updates happen on every request
-- ============================================================================

-- 1. Add tier tracking columns to teams table (if not exists)
DO $$
BEGIN
    -- Add tier column (basic or enterprise)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'teams' AND column_name = 'tier') THEN
        ALTER TABLE public.teams ADD COLUMN tier text DEFAULT 'basic';
    END IF;

    -- Add tier updated timestamp
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'teams' AND column_name = 'tier_updated_at') THEN
        ALTER TABLE public.teams ADD COLUMN tier_updated_at timestamptz DEFAULT now();
    END IF;

    -- Add consecutive low-spend months counter
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'teams' AND column_name = 'consecutive_low_spend_months') THEN
        ALTER TABLE public.teams ADD COLUMN consecutive_low_spend_months int DEFAULT 0;
    END IF;
END $$;

-- 2. Create tier history table for audit trail
CREATE TABLE IF NOT EXISTS public.team_tier_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    old_tier text,
    new_tier text NOT NULL,
    reason text,
    previous_month_spend_usd numeric(12, 2),
    threshold_usd numeric(12, 2),
    consecutive_low_months int,
    changed_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tier_history_team_id ON public.team_tier_history(team_id);
CREATE INDEX IF NOT EXISTS idx_tier_history_changed_at ON public.team_tier_history(changed_at);

-- 3. Function to calculate previous calendar month's spend for a team
CREATE OR REPLACE FUNCTION calculate_team_previous_month_spend(p_team_id uuid)
RETURNS numeric AS $$
DECLARE
    v_spend_nanos bigint;
    v_spend_usd numeric(12, 2);
    v_prev_month_start timestamptz;
    v_prev_month_end timestamptz;
BEGIN
    -- Calculate previous calendar month boundaries
    v_prev_month_start := date_trunc('month', now() - interval '1 month');
    v_prev_month_end := date_trunc('month', now());

    -- Sum all successful request costs from previous month
    SELECT COALESCE(SUM(cost_nanos), 0)
    INTO v_spend_nanos
    FROM public.gateway_requests
    WHERE team_id = p_team_id
      AND success = true
      AND created_at >= v_prev_month_start
      AND created_at < v_prev_month_end;

    -- Convert nanos to USD
    v_spend_usd := ROUND((v_spend_nanos::numeric / 1000000000.0)::numeric, 2);

    RETURN v_spend_usd;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to update a single team's tier
CREATE OR REPLACE FUNCTION update_team_tier(p_team_id uuid)
RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to clean up dormant Enterprise teams (run monthly via cron)
-- Purpose: Handle teams that stopped making requests while on Enterprise tier
-- Active teams are handled by per-request tier calculation in context.sql
CREATE OR REPLACE FUNCTION cleanup_dormant_enterprise_teams()
RETURNS jsonb AS $$
DECLARE
    v_team_id uuid;
    v_spend_30d_nanos bigint;
    v_threshold_nanos bigint := 10000000000000; -- $10k in nanos
    v_tier text;
    v_updated_count int := 0;
    v_total_checked int := 0;
    v_results jsonb[] := '{}';
    v_result text;
BEGIN
    -- Process only Enterprise teams
    FOR v_team_id, v_tier IN
        SELECT id, tier FROM public.teams
        WHERE tier = 'enterprise'
        ORDER BY id
    LOOP
        v_total_checked := v_total_checked + 1;

        -- Calculate rolling 30-day spend
        SELECT COALESCE(SUM(cost_nanos), 0)
        INTO v_spend_30d_nanos
        FROM public.gateway_requests
        WHERE team_id = v_team_id
          AND success = true
          AND created_at >= now() - interval '30 days';

        -- Use the tier calculation function (handles grace period logic)
        v_result := calculate_tier_with_grace(v_team_id, v_spend_30d_nanos);

        -- Track if tier changed (downgraded to basic)
        IF v_result = 'basic' THEN
            v_updated_count := v_updated_count + 1;
            v_results := array_append(v_results, jsonb_build_object(
                'team_id', v_team_id,
                'old_tier', 'enterprise',
                'new_tier', 'basic',
                'spend_30d_usd', ROUND((v_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2)
            ));
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'total_teams_checked', v_total_checked,
        'teams_downgraded', v_updated_count,
        'downgraded_teams', to_jsonb(v_results),
        'processed_at', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to calculate tier based on rolling 30-day spend with grace period
CREATE OR REPLACE FUNCTION calculate_tier_with_grace(
    p_team_id uuid,
    p_spend_30d_nanos bigint
) RETURNS text AS $$
DECLARE
    v_stored_tier text;
    v_consecutive_low int;
    v_threshold_nanos bigint := 10000000000000; -- $10k in nanos (10,000 * 1,000,000,000)
    v_new_tier text;
    v_tier_changed boolean := false;
    v_reason text;
BEGIN
    -- Get current tier and grace period counter
    SELECT
        COALESCE(tier, 'basic'),
        COALESCE(consecutive_low_spend_months, 0)
    INTO
        v_stored_tier,
        v_consecutive_low
    FROM public.teams
    WHERE id = p_team_id;

    -- Determine new tier based on 30-day spend
    IF p_spend_30d_nanos >= v_threshold_nanos THEN
        -- Spending >= $10k → Enterprise tier
        v_new_tier := 'enterprise';

        IF v_stored_tier != 'enterprise' THEN
            v_tier_changed := true;
            v_reason := format('30-day spend $%s reached $10k threshold',
                ROUND((p_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2));
        END IF;

        -- Reset grace period counter
        v_consecutive_low := 0;

    ELSE
        -- Spending < $10k
        IF v_stored_tier = 'enterprise' THEN
            -- Currently Enterprise → Check grace period
            v_consecutive_low := v_consecutive_low + 1;

            IF v_consecutive_low >= 3 THEN
                -- Grace period expired → Downgrade to Basic
                v_new_tier := 'basic';
                v_tier_changed := true;
                v_reason := format('3 consecutive checks below $10k threshold (current 30d: $%s)',
                    ROUND((p_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2));
            ELSE
                -- Still in grace period → Keep Enterprise
                v_new_tier := 'enterprise';
            END IF;
        ELSE
            -- Currently Basic and spend < $10k → Stay Basic
            v_new_tier := 'basic';
        END IF;
    END IF;

    -- Update team tier and grace counter
    UPDATE public.teams
    SET
        tier = v_new_tier,
        tier_updated_at = CASE WHEN v_tier_changed THEN now() ELSE tier_updated_at END,
        consecutive_low_spend_months = v_consecutive_low
    WHERE id = p_team_id;

    -- Log tier change if it happened
    IF v_tier_changed THEN
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
            v_stored_tier,
            v_new_tier,
            v_reason,
            ROUND((p_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2),
            10000.00,
            v_consecutive_low
        );
    END IF;

    RETURN v_new_tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to get team tier info for UI
CREATE OR REPLACE FUNCTION get_team_tier_info(p_team_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_tier text;
    v_tier_updated_at timestamptz;
    v_consecutive_low int;
    v_current_month_spend numeric(12, 2);
    v_prev_month_spend numeric(12, 2);
    v_threshold numeric(12, 2) := 10000.00;
    v_markup_pct numeric(4, 2);
    v_current_month_start timestamptz;
    v_current_month_nanos bigint;
BEGIN
    -- Get team tier data
    SELECT tier, tier_updated_at, consecutive_low_spend_months
    INTO v_tier, v_tier_updated_at, v_consecutive_low
    FROM public.teams
    WHERE id = p_team_id;

    IF v_tier IS NULL THEN
        RAISE EXCEPTION 'Team not found: %', p_team_id;
    END IF;

    -- Determine markup percentage
    v_markup_pct := CASE WHEN v_tier = 'enterprise' THEN 5.00 ELSE 7.00 END;

    -- Calculate current month spend (for progress tracking)
    v_current_month_start := date_trunc('month', now());

    SELECT COALESCE(SUM(cost_nanos), 0)
    INTO v_current_month_nanos
    FROM public.gateway_requests
    WHERE team_id = p_team_id
      AND success = true
      AND created_at >= v_current_month_start;

    v_current_month_spend := ROUND((v_current_month_nanos::numeric / 1000000000.0)::numeric, 2);

    -- Get previous month spend
    v_prev_month_spend := calculate_team_previous_month_spend(p_team_id);

    RETURN jsonb_build_object(
        'tier', v_tier,
        'tier_display', CASE WHEN v_tier = 'enterprise' THEN 'Enterprise' ELSE 'Basic' END,
        'markup_percentage', v_markup_pct,
        'tier_updated_at', v_tier_updated_at,
        'consecutive_low_spend_months', v_consecutive_low,
        'threshold_usd', v_threshold,
        'current_month_spend_usd', v_current_month_spend,
        'previous_month_spend_usd', v_prev_month_spend,
        'progress_to_enterprise_pct', LEAST(100, ROUND((v_current_month_spend / v_threshold * 100)::numeric, 1)),
        'is_eligible_for_enterprise', v_current_month_spend >= v_threshold,
        'months_until_downgrade', CASE
            WHEN v_tier = 'enterprise' THEN GREATEST(0, 3 - v_consecutive_low)
            ELSE NULL
        END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_team_previous_month_spend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_team_tier(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_dormant_enterprise_teams() TO service_role;
GRANT EXECUTE ON FUNCTION calculate_tier_with_grace(uuid, bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_team_tier_info(uuid) TO authenticated;

-- 9. Create index for efficient spend calculations
CREATE INDEX IF NOT EXISTS idx_gateway_requests_team_success_created
ON public.gateway_requests(team_id, success, created_at)
WHERE success = true;

-- 10. Comments
COMMENT ON FUNCTION calculate_tier_with_grace(uuid, bigint) IS 'Calculate team tier based on rolling 30-day spend with 3-check grace period for downgrades. Called automatically before each request in context.sql.';
COMMENT ON FUNCTION cleanup_dormant_enterprise_teams() IS 'Monthly cleanup job to downgrade dormant Enterprise teams. Handles teams that stopped making requests while on Enterprise tier.';
COMMENT ON FUNCTION get_team_tier_info(uuid) IS 'Get comprehensive tier information for display in UI dashboard';

-- ============================================================================
-- SUPABASE pg_cron SETUP (Required for dormant account cleanup)
-- ============================================================================
-- Active teams: Tier calculated before EVERY request via context.sql
-- Dormant teams: Cleaned up monthly via cron to prevent abuse
--
-- Run this in Supabase SQL Editor to enable monthly cleanup:
-- SELECT cron.schedule(
--     'cleanup-dormant-enterprise-teams',
--     '0 0 1 * *',  -- Midnight UTC on 1st of each month
--     $$SELECT cleanup_dormant_enterprise_teams()$$
-- );
--
-- To check scheduled jobs:
-- SELECT * FROM cron.job;
--
-- To view job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- To unschedule:
-- SELECT cron.unschedule('cleanup-dormant-enterprise-teams');
