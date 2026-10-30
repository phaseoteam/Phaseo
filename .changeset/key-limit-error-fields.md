---
"@phaseo/gateway-api": patch
---

A `429 key_limit_exceeded` response now says which limit refused the request and when it resets: `reason` (for example `daily_cost_limit_reached` or `department_daily_cost_budget_reached`) and `reset_at`, with `department_id` and `department_name` when a department budget refused it. They also appear under `error.metadata`. Before, only the description and `Retry-After` carried this.
