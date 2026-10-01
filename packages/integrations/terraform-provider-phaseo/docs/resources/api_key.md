---
page_title: "phaseo_api_key Resource"
description: |-
  Creates and manages a Phaseo Gateway API key.
---

# phaseo_api_key

```terraform
resource "phaseo_api_key" "application" {
  name         = "Production application"
  limit        = 250
  limit_reset  = "monthly"
}
```

The plaintext `key` is returned only during creation. Terraform marks it sensitive, but it remains in Terraform state. Use encrypted remote state with restricted access.

## Schema

### Required

- `name` (String) Human-readable key name.

### Optional

- `workspace_id` (String) Workspace UUID. Defaults to the management key workspace.
- `limit` (Number) Spend limit in USD.
- `limit_reset` (String) Spend-limit window: `daily`, `weekly`, or `monthly`.
- `expires_at` (String) RFC 3339 expiry timestamp.
- `disabled` (Boolean) Whether the key is disabled.
- `soft_blocked` (Boolean) Whether the key is soft-blocked.

### Read-only

- `id` (String) API key UUID.
- `key` (String, Sensitive) Plaintext key returned at creation.
- `prefix` (String) Safe key prefix.
- `status` (String) Current key status.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

Import a key using its UUID. Imported keys do not expose their plaintext value.

```shell
terraform import phaseo_api_key.application 11111111-1111-4111-8111-111111111111
```
