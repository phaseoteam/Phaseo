---
page_title: "phaseo_models Data Source"
description: |-
  Returns the Phaseo model catalogue as JSON.
---

# phaseo_models (Data Source)

```terraform
data "phaseo_models" "available" {}

output "models_json" {
  value = data.phaseo_models.available.json
}
```

Reads the current Phaseo model catalogue.

## Schema

### Read-only

- `json` (String) Canonical JSON response from the Phaseo API.
