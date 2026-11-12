---
page_title: "phaseo_spend_blocks Data Source"
description: |-
  Returns the workspace's active spend blocks as JSON.
---

# phaseo_spend_blocks (Data Source)

```terraform
data "phaseo_spend_blocks" "current" {}

output "spend_blocks_json" {
  value = data.phaseo_spend_blocks.current.json
}
```

Reads the spend rule blocks that are refusing requests now, with their scope, limit and reset time. Requires `spend_rules:read`.

## Schema

### Read-only

- `json` (String) Canonical JSON response from the Phaseo API.
