# Spending guardrails

Phaseo should treat funding, budgets, and notifications as separate controls. A credit balance answers whether a workspace can pay. A budget limits how much a scope may spend during a period. An alert reports approaching or crossing a threshold without changing request admission.

## Scope hierarchy

The long-term hierarchy should be:

1. Enterprise account or organisation
2. Workspace
3. API key

A member, project, or application allocation can be added later without changing the accounting model. The existing key request and cost limits remain the most specific guardrail. A request is admitted only when every applicable hard limit has enough remaining allowance. The effective allowance is the smallest remaining allowance across the account, workspace, and key scopes; allowances are never added together.

An “account” must be an explicit billing organisation that owns workspaces, not an inferred grouping of every workspace a user can access. Membership can overlap and is not a safe accounting boundary.

## Control types

- Alerts are non-blocking and can notify at configurable thresholds such as 50%, 75%, 90%, and 100%.
- Soft limits warn billing contacts and workspace administrators but continue serving requests.
- Hard limits reject new work once the applicable allowance is exhausted.
- Credit balance remains a separate funding check. A workspace can have credit but still be over budget, or be under budget but lack credit.

Periods should initially use UTC calendar day, week, and month boundaries, matching the existing key-limit behavior. Configurable billing time zones can be added once the product has a clear period-reset contract.

## Authoritative accounting

All monetary values use integer nanos. Request admission must atomically reserve a conservative maximum charge against every applicable scope. Completion settles the actual charge exactly once and releases the unused reservation. The committed amount for a period is:

`settled spend + outstanding reservations`

The system must not count both a reservation and its settled replacement. Key spend rolls into its workspace and enterprise account once; each scope is a view of the same charge, not an additional charge. Batch, video, realtime, retries, refunds, credits, and manual adjustments must use the same immutable charge identity and settlement path.

If an upstream request fails, settlement follows the applicable billing policy and releases any unbillable remainder. Refunds and corrections are immutable negative ledger entries rather than edits to prior usage. Admission and settlement should run through database functions with row locks or atomic counter updates so concurrent requests cannot overspend a limit.

## Suggested data model

- `spending_budgets`: amount, currency, period, control type, reset rules, and active dates.
- `spending_budget_scopes`: associates one budget with an enterprise account, workspace, key, or future member/project scope.
- `spending_budget_counters`: period start, settled nanos, reserved nanos, and a version for atomic updates.
- `spending_budget_reservations`: request identity, estimated nanos, status, expiry, and final settlement identity.
- `spending_alert_deliveries`: threshold, recipient, period, and deduplication key.

Recipients should be role based: enterprise billing contacts for account budgets; workspace owners, administrators, and billing members for workspace budgets; and optionally the key creator for key budgets. Notification delivery should use the existing email outbox with stable deduplication keys.

## Rollout

1. Add workspace-level usage alerts backed by existing settled usage data. This is non-blocking and validates recipient and threshold behavior.
2. Add atomic workspace reservations and hard limits to gateway admission, while adapting existing key limits to the same accounting primitive.
3. Introduce explicit enterprise billing accounts, aggregate workspace spend, and enforce account-level limits.
4. Add member, project, or application allocations only after requests have a reliable attribution field.

The first rollout must include dashboards showing settled, reserved, and remaining amounts. Operators need those three values to explain why a request was accepted or rejected.
