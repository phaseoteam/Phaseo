---
page_title: "phaseo_guardrail Resource"
description: |-
  Manages a Phaseo workspace guardrail policy.
---

# phaseo_guardrail

```terraform
resource "phaseo_guardrail" "default" {
  name                         = "Default policy"
  provider_restriction_mode    = "allowlist"
  provider_ids                 = ["provider-id"]
  model_restriction_mode       = "allowlist"
  model_ids                    = ["model-id"]
  prompt_injection_enabled     = true
  prompt_injection_action      = "block"
  sensitive_info_enabled       = true
  sensitive_info_default_action = "redact"
}
```

Manages a workspace guardrail policy, including privacy, provider/model restrictions, prompt-injection detection, and sensitive-information handling.

## Schema

### Required

- `name` (String) Guardrail policy name.

### Optional

- `description` (String) Policy description.
- `enabled` (Boolean) Whether the policy is enabled.
- `privacy_paid_may_train` (Boolean) Whether paid requests may be used for training.
- `privacy_free_may_train` (Boolean) Whether free requests may be used for training.
- `privacy_free_may_publish_prompts` (Boolean) Whether free prompts may be published.
- `privacy_input_output_logging` (Boolean) Whether input and output logging is enabled.
- `privacy_zdr_only` (Boolean) Whether zero-data-retention providers are required.
- `provider_restriction_mode` (String) `none`, `allowlist`, or `blocklist`.
- `provider_ids` (Set of String) Provider identifiers used by the restriction mode.
- `provider_restriction_enforce_allowed` (Boolean) Whether allowed providers are enforced.
- `model_restriction_mode` (String) `none`, `allowlist`, or `blocklist`.
- `model_ids` (Set of String) Model identifiers used by the restriction mode.
- `prompt_injection_enabled` (Boolean) Whether prompt-injection detection is enabled.
- `prompt_injection_action` (String) `flag` or `block`.
- `sensitive_info_enabled` (Boolean) Whether sensitive-information detection is enabled.
- `sensitive_info_default_action` (String) `flag`, `redact`, or `block`.

### Read-only

- `id` (String) Guardrail identifier.
- `workspace_id` (String) Workspace identifier.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

Import a guardrail using its UUID.

```shell
terraform import phaseo_guardrail.default 11111111-1111-4111-8111-111111111111
```
