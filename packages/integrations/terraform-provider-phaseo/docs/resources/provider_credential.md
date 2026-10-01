---
page_title: "phaseo_provider_credential Resource"
description: |-
  Manages a write-only Phaseo BYOK provider credential.
---

# phaseo_provider_credential

```terraform
resource "phaseo_provider_credential" "primary" {
  provider_id = "provider-id"
  name        = "Primary provider credential"
  key         = var.provider_api_key
  routing_mode = "priority"
  allowed_models = ["model-id"]
}
```

Creates and manages an encrypted BYOK provider credential. Phaseo never returns the raw credential after creation, and Terraform marks `key` as sensitive. Keep the value in a secret variable and use encrypted state.

## Schema

### Required

- `provider_id` (String) Phaseo provider identifier. Changing it replaces the credential.
- `name` (String) Credential name.
- `key` (String, Sensitive) Raw provider credential. Phaseo encrypts it and never returns it.

### Optional

- `enabled` (Boolean) Whether the credential is enabled.
- `routing_mode` (String) `priority` or `fallback`.
- `allowed_models` (Set of String) Model slugs allowed to use the credential.
- `allowed_api_key_ids` (Set of String) Phaseo API key identifiers allowed to use the credential.

### Read-only

- `id` (String) Credential identifier.
- `workspace_id` (String) Workspace identifier.
- `prefix` (String) First six characters of the credential for masked identification.
- `suffix` (String) Last four characters of the credential for masked identification.
- `verification_status` (String) Current verification status.
- `error_message` (String) Latest verification error, when present.
- `last_verified_at` (String) Last verification timestamp.
- `last_used_at` (String) Last usage timestamp.
- `created_at` (String) Creation timestamp.
- `created_by` (String) Creator identifier.

## Import

Provider credentials cannot be imported because Phaseo never returns the raw credential required to populate Terraform state.
