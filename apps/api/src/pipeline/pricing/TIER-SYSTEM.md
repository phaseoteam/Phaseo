# Two-Tier Pricing System Documentation

## Overview

The AI Gateway uses a simplified two-tier pricing system with **hybrid tier management**:

- **Basic Tier**: 7% markup (default)
- **Enterprise Tier**: 5% markup (high-volume teams)

**How it works:**
- **Active teams**: Tier calculated in real-time before every request (rolling 30-day spend)
- **Dormant teams**: Cleaned up monthly via cron (prevents indefinite Enterprise status)

## Tier Logic

### Real-Time Calculation ⚡
- Tier is calculated **before EVERY request** based on **rolling 30-day spend**
- If last 30 days >= **$10,000** → Enterprise tier (5% fee)
- If last 30 days < **$10,000** → Basic tier (7% fee)
- The request that crosses the threshold uses the Basic rate, future requests use Enterprise rate

### Grace Period for Downgrades 🛡️
- Enterprise teams aren't immediately downgraded when spending dips below $10k
- Grace period: **3 consecutive tier checks** (across multiple requests)
- If 30-day spend stays below $10k for 3 checks → Downgrade to Basic
- If 30-day spend goes back above $10k at any point → Counter resets to 0

### Example Flow: Active Team
```
Request 1: 30-day spend = $9,000 → Basic (7%) → Counter: 0
Request 2: 30-day spend = $12,000 → Enterprise (5%) → Counter: 0
Request 3: 30-day spend = $11,500 → Enterprise (5%) → Counter: 0
Request 4: 30-day spend = $9,500 → Enterprise (5%) → Counter: 1 (grace)
Request 5: 30-day spend = $8,800 → Enterprise (5%) → Counter: 2 (grace)
Request 6: 30-day spend = $8,200 → Enterprise (5%) → Counter: 3 (grace)
Request 7: 30-day spend = $7,900 → Basic (7%) → Counter: 0 (downgraded)
```

### Example Flow: Dormant Team (Why Cron Is Needed)
```
Day 1: Team reaches Enterprise ($12k in 30 days)
Day 2-180: Team makes ZERO requests (dormant for 6 months)

Without monthly cron:
  → Team stays Enterprise forever (no requests = no tier checks)
  → Could abuse system by hitting threshold once, then going dormant

With monthly cron (1st of each month):
  → Month 1: Check 30-day spend = $0 → Counter: 1 → Keep Enterprise
  → Month 2: Check 30-day spend = $0 → Counter: 2 → Keep Enterprise
  → Month 3: Check 30-day spend = $0 → Counter: 3 → Keep Enterprise
  → Month 4: Check 30-day spend = $0 → Downgrade to Basic ✅

If team resumes activity:
  → Their next request will use the updated tier (Basic)
```

## System Architecture

### Database Schema

```sql
-- teams table columns
tier                              text        DEFAULT 'basic'
tier_updated_at                   timestamptz DEFAULT now()
consecutive_low_spend_months      int         DEFAULT 0

-- team_tier_history table (audit trail)
id                                uuid
team_id                           uuid
old_tier                          text
new_tier                          text
reason                            text
previous_month_spend_usd          numeric(12, 2)
threshold_usd                     numeric(12, 2)
consecutive_low_months            int
changed_at                        timestamptz
```

### Key Functions

1. **`calculate_tier_with_grace(team_id, spend_30d_nanos)`**
   - Called automatically before EVERY request in `context.sql`
   - Takes rolling 30-day spend as input
   - Calculates tier with grace period logic
   - Updates team tier in database if it changed
   - Returns: Current effective tier ('basic' or 'enterprise')

2. **`cleanup_dormant_enterprise_teams()`**
   - Runs monthly via pg_cron (1st of each month)
   - Checks only Enterprise teams
   - Calculates rolling 30-day spend for each
   - Applies grace period logic (same as per-request)
   - Downgrades dormant teams after 3 consecutive checks below threshold
   - Returns: `{total_teams_checked, teams_downgraded, downgraded_teams}`

3. **`get_team_tier_info(team_id)`**
   - UI helper function
   - Returns comprehensive tier info for dashboard display
   - Includes 30-day spend, thresholds, and grace period status

## Implementation Details

### Request Pipeline Integration

**File**: `apps/api/src/pipeline/before/context.sql`

The tier is calculated **before** the request is processed:

```sql
-- Calculate team 30-day spend from gateway_requests
SELECT COALESCE(SUM(cost_nanos), 0) INTO team_spend_30d_nanos
FROM gateway_requests
WHERE team_id = gateway_fetch_request_context.team_id
  AND success = true
  AND created_at >= now() - interval '30 days';

-- Calculate tier with grace period (updates database if changed)
team_tier := calculate_tier_with_grace(
    gateway_fetch_request_context.team_id,
    team_spend_30d_nanos
);

-- Return tier in context for use in pricing
```

The tier is then available in `ctx.teamEnrichment.tier` throughout the pipeline.

### Tier-Based Markup Application

**Files**: `apps/api/src/pipeline/after/*.ts`

All pricing calculations pull the tier from context:
```typescript
const tier = ctx.teamEnrichment?.tier ?? 'basic';
const { pricedUsage, totalCents, totalNanos } = calculatePricing(
    shapedUsage,
    card,
    ctx.body,
    tier  // Applied to all pricing calculations
);
```

### Auto-Recharge Fee Handling

**File**: `apps/web/src/app/api/webhooks/stripe-checkout/route.ts`

When auto-recharge triggers:

1. **Charge Creation** (`persist.ts`):
   - Charges customer the raw `auto_top_up_amount` (e.g., $100)

2. **Webhook Processing** (`stripe-checkout/route.ts`):
   - Fetches team's **current tier** from database (includes instant upgrades)
   - Applies reverse calculation: `net = gross / (1 + fee_rate)`
   - **Example**:
     - Basic (7%): Pay $100 → Receive $93.46 ($6.54 fee)
     - Enterprise (5%): Pay $100 → Receive $95.24 ($4.76 fee)

```typescript
// Fetch current tier (includes instant upgrades)
const { data: teamData } = await supabase
    .from('teams')
    .select('tier')
    .eq('id', wallet.team_id)
    .single();

const tier = teamData?.tier ?? 'basic';
const feePct = tier === 'enterprise' ? 5.0 : 7.0;

// Reverse-engineer net amount from gross
const { netNanos, feeNanos } = computeNetAndFeeFromGross(grossNanos, feePct);

// Credit wallet with net amount (after fee)
await supabase
    .from('wallets')
    .update({ balance_nanos: afterBalanceNanos })
    .eq('team_id', wallet.team_id);
```

## Deployment Checklist

### 1. Deploy SQL Migration ⚠️ REQUIRED

Run `tier-migration.sql` in Supabase SQL Editor:

```bash
# Copy the entire contents of:
apps/api/src/pipeline/pricing/tier-migration.sql

# Paste and execute in Supabase Dashboard → SQL Editor
```

This creates:
- ✅ Tier columns on teams table
- ✅ Tier history audit table
- ✅ Instant upgrade function
- ✅ Monthly downgrade function
- ✅ UI helper functions
- ✅ Efficient indexes

### 2. Enable Monthly Dormant Cleanup Cron ⚠️ REQUIRED

**Why needed:** Active teams get real-time tier updates before each request. But dormant teams (no requests for months) need periodic cleanup to prevent staying on Enterprise tier indefinitely.

In Supabase SQL Editor (as admin):

```sql
-- Schedule monthly cleanup for dormant Enterprise teams
SELECT cron.schedule(
    'cleanup-dormant-enterprise-teams',
    '0 0 1 * *',  -- Midnight UTC on 1st of each month
    $$SELECT cleanup_dormant_enterprise_teams()$$
);

-- Verify it's scheduled
SELECT * FROM cron.job;
```

**What it does:**
- Checks only Enterprise teams
- Calculates their rolling 30-day spend
- Applies grace period logic (same as per-request)
- Downgrades dormant teams after 3 checks below threshold

### 3. Deploy Code Changes ✅ COMPLETED

The following files have been updated and are ready to deploy:

**Backend (API)**:
- ✅ `apps/api/src/pipeline/pricing/tier-markup.ts` (NEW)
- ✅ `apps/api/src/pipeline/pricing/persist.ts` (instant upgrade check)
- ✅ `apps/api/src/pipeline/after/pricing.ts` (tier parameter)
- ✅ `apps/api/src/pipeline/after/index.ts` (tier from context)
- ✅ `apps/api/src/pipeline/after/stream.ts` (tier from context, 3 locations)

**Frontend (Web)**:
- ✅ `apps/web/src/components/(gateway)/credits/tiers.ts` (two-tier definitions)
- ✅ `apps/web/src/components/(gateway)/credits/TieringProgress.tsx` (new UI)
- ✅ `apps/web/src/components/(gateway)/credits/TierBadge.tsx` (updated text)
- ✅ `apps/web/src/app/api/webhooks/stripe-checkout/route.ts` (tier from DB)

### 4. Initialize Existing Teams (Optional)

After SQL migration, optionally set initial tiers for existing teams:

```sql
-- Check which teams should be on Enterprise based on current month spend
SELECT
    t.id,
    t.tier,
    ROUND((SUM(gr.cost_nanos)::numeric / 1000000000.0)::numeric, 2) as current_month_spend
FROM teams t
LEFT JOIN gateway_requests gr ON gr.team_id = t.id
    AND gr.success = true
    AND gr.created_at >= date_trunc('month', now())
GROUP BY t.id, t.tier
HAVING ROUND((SUM(gr.cost_nanos)::numeric / 1000000000.0)::numeric, 2) >= 10000
ORDER BY current_month_spend DESC;

-- Manually upgrade these teams if needed
UPDATE teams SET tier = 'enterprise', tier_updated_at = now() WHERE id = '...';
```

## Testing

### Test Instant Upgrades

1. Create test team on Basic tier
2. Make gateway requests totaling $10,000+
3. Verify tier changes to Enterprise immediately
4. Check `team_tier_history` for audit entry

```sql
SELECT * FROM team_tier_history WHERE team_id = '...' ORDER BY changed_at DESC;
```

### Test Monthly Downgrades

1. Create test team on Enterprise tier
2. Set `consecutive_low_spend_months = 2`
3. Ensure current month spend < $10k
4. Run: `SELECT update_all_team_tiers();`
5. Verify tier downgrades to Basic
6. Check audit history

### Test Auto-Recharge Fees

1. Enable auto-recharge for test team
2. Set balance below threshold
3. Make gateway request to trigger recharge
4. Verify Stripe charge is created
5. Check webhook applies correct tier fee
6. Verify wallet credited with net amount (after fee)

**Expected Results**:
- Basic tier: Pay $100 → Receive ~$93.46
- Enterprise tier: Pay $100 → Receive ~$95.24

## Monitoring

### Key Metrics to Track

```sql
-- Current tier distribution
SELECT tier, COUNT(*) as team_count
FROM teams
GROUP BY tier;

-- Teams at risk of downgrade (Enterprise with 2+ low months)
SELECT id, tier, consecutive_low_spend_months
FROM teams
WHERE tier = 'enterprise' AND consecutive_low_spend_months >= 2;

-- Recent tier changes
SELECT * FROM team_tier_history
WHERE changed_at >= now() - interval '7 days'
ORDER BY changed_at DESC;

-- Monthly tier change summary
SELECT
    DATE_TRUNC('month', changed_at) as month,
    old_tier,
    new_tier,
    COUNT(*) as changes
FROM team_tier_history
GROUP BY month, old_tier, new_tier
ORDER BY month DESC;
```

## Troubleshooting

### Team not upgrading to Enterprise

**Check**:
1. Current month spend: `SELECT get_team_tier_info('team_id');`
2. Tier upgrade log: `SELECT * FROM team_tier_history WHERE team_id = '...' ORDER BY changed_at DESC;`
3. Gateway request records: Ensure `success = true` and `cost_nanos > 0`

**Fix**: Manually upgrade if needed:
```sql
UPDATE teams SET tier = 'enterprise', consecutive_low_spend_months = 0 WHERE id = '...';
```

### Auto-recharge applying wrong fee

**Check**:
1. Team tier at time of webhook: Query `teams` table
2. Webhook logs: Check `[stripe-webhook]` console output
3. Ledger entry: `SELECT * FROM credit_ledger WHERE ref_id = 'pi_xxx';`

**Fix**: Ensure webhook fetches tier from database (not recalculating)

### pg_cron not running

**Check**:
```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- View job run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

**Fix**: Re-schedule if missing:
```sql
SELECT cron.schedule('monthly-tier-downgrade-check', '0 0 1 * *', $$SELECT update_all_team_tiers()$$);
```

## Future Enhancements

### Potential Improvements

1. **Configurable Thresholds**
   - Make $10k threshold adjustable per team
   - Allow custom tier definitions

2. **Grace Period Notifications**
   - Email alerts when Enterprise team has 2 consecutive low months
   - Warning in dashboard UI

3. **Tier Forecasting**
   - Predict next month's tier based on current spend trajectory
   - Show "days until Enterprise" for Basic teams

4. **Custom Tier Discounts**
   - Allow manual tier overrides for special partnerships
   - Custom markup percentages per team

5. **API Endpoints**
   - `GET /v1/control/team/tier` - Get current tier info
   - `POST /v1/control/team/tier` - Manually set tier (admin only)

## Support

For questions or issues:
- Check tier history: `SELECT * FROM team_tier_history WHERE team_id = '...';`
- Review logs: Look for `[tier-upgrade]` and `[stripe-webhook]` prefixes
- Manual override: Contact admin to adjust tier manually if needed
