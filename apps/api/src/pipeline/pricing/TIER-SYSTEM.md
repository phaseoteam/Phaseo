# Workspace Pricing System

## Overview

The Gateway now runs on a **single-plan pricing model**:

- **Standard plan**: 5% markup on credit purchases
- **Model usage pricing**: billed at catalog rates
- **No active enterprise/basic fee split** in the request path

The repo still retains some compatibility surfaces named around "tiers" so older RPC calls and UI contracts do not break, but current pricing is flat.

## Current Behavior

### Request path

- `calculate_tier_with_grace(...)` is still called by the request context RPC for compatibility.
- In the current schema it resolves to the flat standard plan and returns the legacy `"basic"` value.
- Pricing application ignores legacy tier differentiation and applies a flat 5% workspace markup.

### Dashboard/UI

- `get_workspace_tier_info(...)` still exists for the dashboard.
- It returns:
  - `tier: "basic"` for compatibility
  - `tier_display: "Standard"`
  - `markup_percentage: 5.00`
  - current and previous month spend

### Billing and top-ups

- Credit purchases use a flat 5% top-up fee.
- Stripe webhook handling reverse-calculates the fee from the gross payment amount using `5.0`.
- Auto-recharge follows the same flat-fee behavior.

## Source of Truth

The active database behavior is defined by the Supabase migrations:

- [20260423120000_single_tier_workspace_pricing.sql](/E:/ai-stats-public/supabase/migrations/20260423120000_single_tier_workspace_pricing.sql)
- [20260423170000_workspace_pricing_invoicing_cleanup.sql](/E:/ai-stats-public/supabase/migrations/20260423170000_workspace_pricing_invoicing_cleanup.sql)

Those migrations:

- normalize workspaces to the flat standard tier
- keep legacy function names stable
- remove old enterprise/invoice tier bookkeeping

## Compatibility Notes

Some files and fields still use tier-oriented names because they are part of older public or internal contracts:

- workspace `tier` column
- `calculate_tier_with_grace(...)`
- `cleanup_dormant_enterprise_workspaces()`
- `get_workspace_tier_info(...)`

These should be treated as compatibility shims, not as evidence of an active multi-tier pricing model.

## Operational Summary

If you need to reason about pricing today:

1. Credit purchases incur a **5%** top-up fee.
2. Usage consumes credits at catalog pricing.
3. There is a single live top-up fee path in the current standard Gateway billing model: **5%**.
