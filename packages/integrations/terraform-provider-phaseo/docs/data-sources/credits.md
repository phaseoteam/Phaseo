---
page_title: "phaseo_credits Data Source"
description: |-
  Returns current Phaseo credit information as JSON.
---

# phaseo_credits (Data Source)

```terraform
data "phaseo_credits" "current" {}

output "credits_json" {
  value = data.phaseo_credits.current.json
}
```

Reads current Phaseo credit information for the authenticated account.

## Schema

### Read-only

- `json` (String) Canonical JSON response from the Phaseo API.
