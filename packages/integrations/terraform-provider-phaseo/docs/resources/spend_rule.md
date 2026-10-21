---
page_title: "phaseo_spend_rule Resource"
description: |-
  Manages a Phaseo spend rule: an alert on spend, a percentage of a base, a forecast, a spike, or the workspace balance, that can also block requests once spend passes a grace margin.
---

# phaseo_spend_rule

```terraform
resource "phaseo_workspace_budget" "monthly" {
  interval = "monthly"
  limit    = 500
}

# Alert at 50, 80 and 100% of the monthly budget, and block at 110%.
resource "phaseo_spend_rule" "monthly_budget" {
  name               = "Monthly budget"
  metric             = "budget_percent"
  period             = "month"
  base_kind          = "workspace_budget"
  base_ref           = "monthly"
  threshold_percents = [50, 80, 100]
  action             = "block"
  block_at_percent   = 110

  depends_on = [phaseo_workspace_budget.monthly]
}

# Alert when one API key spends $40 in a New York day.
resource "phaseo_spend_rule" "key_daily" {
  name                 = "Production key daily spend"
  metric               = "spend"
  scope_type           = "key"
  scope_id             = phaseo_api_key.application.id
  period               = "day"
  time_zone            = "America/New_York"
  threshold_amount_usd = 40
}

# Alert when spend in the last 3 hours is 4 times the usual.
resource "phaseo_spend_rule" "spike" {
  name             = "Spend spike"
  metric           = "spike"
  period           = "rolling"
  window_hours     = 3
  spike_multiplier = 4
}

# Alert when the balance would run out within 7 days at last week's pace.
resource "phaseo_spend_rule" "runway" {
  name         = "Runway"
  metric       = "balance"
  period       = "rolling"
  window_hours = 168
  runway_days  = 7
}
```

Manages a workspace spend rule. A rule notifies at thresholds over a scope and a period, and can block requests once spend reaches its block point. Blocking is best effort: it starts a few minutes after spend passes the block point. Use API key limits or `phaseo_workspace_budget` for caps that are checked on every request.

The API validates how fields combine (which metric needs which threshold, base and period) and returns a descriptive error for an invalid combination. See the [spend alerts guide](https://phaseo.app/docs/v1/guides/spend-alerts) for each metric.

Amounts are in USD and are stored as exact nanodollars. Optional attributes that are not set are cleared on the rule, so removing one from the configuration removes it from the rule.

## Schema

### Required

- `name` (String) Rule name, 1 to 100 characters.
- `metric` (String) `spend`, `budget_percent`, `forecast`, `spike`, or `balance`.
- `period` (String) `day`, `week` (Monday to Sunday), `month`, or `rolling`.

### Optional

- `enabled` (Boolean) Whether the rule is evaluated. Defaults to `true`.
- `scope_type` (String) `workspace`, `key`, `member`, `department`, `model`, or `provider`. Defaults to `workspace`.
- `scope_id` (String) The key ID, member user ID, department ID, model ID, or provider ID. Leave unset for the workspace scope.
- `window_hours` (Number) Hours in a rolling window, 1 to 720. Required for the `rolling` period. Spike rules use it as the spike window (at most 56); balance rules as the burn-rate lookback.
- `time_zone` (String) IANA time zone for calendar periods, such as `Europe/London`. Leave unset to use the workspace billing time zone.
- `base_kind` (String) What percentages are measured against: `amount`, `workspace_budget`, `key_limit`, or `previous_period`.
- `base_ref` (String) `daily`, `weekly`, or `monthly`: the workspace budget or key limit that is the base. It must match the period.
- `base_amount_usd` (Number) The base in USD when `base_kind` is `amount`.
- `threshold_percents` (Set of Number) One to five percentages of the base, 1 to 1000.
- `threshold_amount_usd` (Number) `spend`: the amount that sends an alert. `forecast`: the projected amount. `balance`: alert when the available balance is at or below this amount.
- `runway_days` (Number) `balance` rules: alert when the balance would last fewer than this many days, 1 to 365.
- `spike_multiplier` (Number) `spike` rules: alert when spend is at least this multiple of the usual spend. Defaults to `3` for spike rules.
- `spike_floor_usd` (Number) `spike` rules: the least spend in the window that can alert. Defaults to `5` for spike rules.
- `action` (String) `notify`, or `block` (`spend` and `budget_percent` rules only). Defaults to `notify`.
- `block_at_percent` (Number) `budget_percent` rules that block: block at this percentage of the base, 100 to 1000 and at least the highest threshold. Defaults to `110`.
- `block_at_amount_usd` (Number) `spend` rules that block: block at this amount, at least `threshold_amount_usd`. Required for those rules.
- `block_free_models` (Boolean) Whether a block also refuses free models. Defaults to `false`.
- `cooldown_minutes` (Number) Rolling, spike, and balance rules: minutes before the rule can alert again, 5 to 43200. Defaults to `360`.
- `destination_ids` (Set of String) Notification destinations for this rule. When empty, the workspace's Spend Alerts and Spend Blocks routes are used.

### Read-only

- `id` (String) Spend rule identifier.
- `workspace_id` (String) Workspace identifier.
- `evaluated` (Boolean) Whether the evaluator fires on this combination of metric, period, and base.
- `created_by` (String) User who created the rule.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

Import a spend rule using its UUID.

```shell
terraform import phaseo_spend_rule.monthly_budget 11111111-1111-4111-8111-111111111111
```

The management key needs `spend_rules:read`, `spend_rules:write`, and `spend_rules:delete`.
