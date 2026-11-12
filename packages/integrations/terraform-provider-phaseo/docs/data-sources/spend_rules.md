---
page_title: "phaseo_spend_rules Data Source"
description: |-
  Returns the workspace's spend rules as JSON.
---

# phaseo_spend_rules (Data Source)

```terraform
data "phaseo_spend_rules" "current" {}

output "spend_rules_json" {
  value = data.phaseo_spend_rules.current.json
}
```

Reads every spend rule in the workspace, with its thresholds, action, destinations and whether it is evaluated. Requires `spend_rules:read`.

## Schema

### Read-only

- `json` (String) Canonical JSON response from the Phaseo API.
