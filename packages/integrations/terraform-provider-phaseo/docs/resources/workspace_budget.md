---
page_title: "phaseo_workspace_budget Resource"
description: |-
  Manages an enforced Phaseo workspace budget. Requests are refused once the workspace's spend in the interval reaches the limit. Intervals reset in UTC.
---

# phaseo_workspace_budget

```terraform
resource "phaseo_workspace_budget" "monthly" {
  interval = "monthly"
  limit    = 500
}
```

Manages a workspace budget: a spend ceiling for the whole workspace that is checked on every request. Once spend in the interval reaches the limit, requests return `429` with the `key_limit_exceeded` error code until the interval resets. Daily, weekly (Monday) and monthly budgets reset on UTC boundaries; a lifetime budget never resets.

A workspace has at most one budget per interval. Creating a second budget with the same interval fails. Use the `phaseo_workspace_budgets` data source to read current usage and reset times, which change with every request and are not stored on this resource.

## Schema

### Required

- `interval` (String) `daily`, `weekly`, `monthly`, or `lifetime`.
- `limit` (Number) Spend limit in USD for the interval.

### Read-only

- `id` (String) Budget identifier.
- `workspace_id` (String) Workspace identifier.
- `limit_nanos` (Number) The limit in nanodollars, as the API stores it.
- `created_by` (String) User who created the budget.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

Import a workspace budget using its UUID.

```shell
terraform import phaseo_workspace_budget.monthly 11111111-1111-4111-8111-111111111111
```

The management key needs `budgets:read`, `budgets:write`, and `budgets:delete`.
