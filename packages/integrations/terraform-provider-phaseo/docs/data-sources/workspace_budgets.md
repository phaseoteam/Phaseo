---
page_title: "phaseo_workspace_budgets Data Source"
description: |-
  Returns the workspace's budgets, with current usage and reset times, as JSON.
---

# phaseo_workspace_budgets (Data Source)

```terraform
data "phaseo_workspace_budgets" "current" {}

output "workspace_budgets_json" {
  value = data.phaseo_workspace_budgets.current.json
}
```

Reads the workspace's budgets with live usage, remaining spend and the next reset. Requires `budgets:read`.

## Schema

### Read-only

- `json` (String) Canonical JSON response from the Phaseo API.
