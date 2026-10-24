---
page_title: "phaseo_rate_limit_assignment Resource"
description: |-
  Applies a Phaseo rate limit policy to a key, member, department, guardrail or every end user.
---

# phaseo_rate_limit_assignment

```terraform
resource "phaseo_rate_limit_assignment" "production_key" {
  policy_id   = phaseo_rate_limit_policy.standard.id
  target_type = "key"
  target_id   = phaseo_api_key.production.id
}

resource "phaseo_rate_limit_assignment" "end_users" {
  policy_id   = phaseo_rate_limit_policy.per_end_user.id
  target_type = "end_user_default"
}
```

Each key, member, department and guardrail can have one policy. A department's policy is one allowance shared by everyone in it; a guardrail's policy gives each key and member it covers its own allowance. The end-user default gives each end user, identified by the request's `user` field or `X-Phaseo-User-Id` header, their own allowance.

## Schema

### Required

- `policy_id` (String) The policy to apply. Changing it switches the target to another policy in place.
- `target_type` (String) `key`, `member`, `department`, `guardrail` or `end_user_default`. Changing it replaces the assignment.

### Optional

- `target_id` (String) The key, user, department or guardrail ID. Omit it for `end_user_default`. Changing it replaces the assignment.

### Read-only

- `id` (String) Assignment identifier.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

```shell
terraform import phaseo_rate_limit_assignment.production_key 11111111-1111-4111-8111-111111111111
```
