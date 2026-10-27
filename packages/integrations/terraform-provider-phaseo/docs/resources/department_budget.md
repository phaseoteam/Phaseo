---
page_title: "phaseo_department_budget Resource"
description: |-
  Manages a Phaseo department spend budget.
---

# phaseo_department_budget

```terraform
resource "phaseo_department_budget" "research_monthly" {
  department_id = "11111111-1111-4111-8111-111111111111"
  interval      = "monthly"
  limit         = 500
}
```

A department budget alerts and never blocks requests: owners and admins are notified at about 80% and 100% of it. A department's spend is what its linked API keys cost, plus its members' keys that aren't linked to a department and their OAuth requests. Each department can have one budget per interval.

## Schema

### Required

- `department_id` (String) Department identifier. Changing it replaces the budget.
- `interval` (String) `daily`, `weekly` or `monthly`, on UTC boundaries.
- `limit` (Number) Budget in USD.

### Read-only

- `id` (String) Budget identifier.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

```shell
terraform import phaseo_department_budget.research_monthly 11111111-1111-4111-8111-111111111111
```
