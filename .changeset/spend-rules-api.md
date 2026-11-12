---
"@phaseo/gateway-api": minor
---

Add beta management endpoints for spend rules (`/v1/control/spend-rules`): list, create, get, update and delete (soft delete), plus `POST /{id}/test` (sends the rule's alert now, marked TEST, to its destinations or the Spend Alerts route; 5 tests per workspace per minute), `GET /{id}/preview` (current period, spend so far, base, percent and next threshold, computed exactly as the evaluator does) and `GET /{id}/history` (queued alerts with delivery counts and recent period records, paged). New `spend_rules:read`, `spend_rules:write` and `spend_rules:delete` scopes; members can read, owners and admins write. Every metric the database allows is accepted; `forecast`, `spike` and `balance` rules, rolling periods and `previous_period` bases are saved with `evaluated: false` and start firing in a later release. Amounts are returned in nanodollars and as `*_usd`, and accepted as either.
