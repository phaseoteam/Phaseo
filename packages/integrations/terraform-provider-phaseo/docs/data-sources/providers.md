---
page_title: "phaseo_providers Data Source"
description: |-
  Returns the Phaseo provider catalogue as JSON.
---

# phaseo_providers (Data Source)

```terraform
data "phaseo_providers" "available" {}

output "providers_json" {
  value = data.phaseo_providers.available.json
}
```

Reads the current Phaseo provider catalogue.

## Schema

### Read-only

- `json` (String) Canonical JSON response from the Phaseo API.
