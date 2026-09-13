---
page_title: "Phaseo Provider"
description: |-
  Manage Phaseo workspaces and Gateway API keys with Terraform.
---

# Phaseo Provider

The Phaseo provider manages resources through the Phaseo management API. Configure it with a management API key in `PHASEO_API_KEY`.

```terraform
terraform {
  required_providers {
    phaseo = {
      source = "phaseoteam/phaseo"
    }
  }
}

provider "phaseo" {}
```

## Schema

### Optional

- `api_key` (String, Sensitive) Phaseo management API key. Prefer `PHASEO_API_KEY`.
- `base_url` (String) Phaseo API base URL. Defaults to `https://api.phaseo.app/v1`; may also be set with `PHASEO_BASE_URL`.
