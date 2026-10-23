---
page_title: "phaseo_rate_limit_policy Resource"
description: |-
  Manages a named Phaseo workspace rate limit policy.
---

# phaseo_rate_limit_policy

```terraform
resource "phaseo_rate_limit_policy" "standard" {
  name                = "Standard"
  description         = "Most production keys"
  requests_per_minute = 600
  tokens_per_minute   = 2000000
  concurrent_requests = 20
}
```

A named set of limits. It applies to nothing until it is assigned with `phaseo_rate_limit_assignment`. When several policies apply to a request, each is counted and the first one used up rejects the request with `429 rate_limit_exceeded`. Set at least one limit.

## Schema

### Required

- `name` (String) Policy name, up to 100 characters. Unique in the workspace.

### Optional

- `description` (String) Up to 500 characters. Omit it rather than setting an empty string; names and descriptions must not start or end with whitespace, because the API trims them.
- `requests_per_minute` (Number) Requests allowed per rolling minute.
- `tokens_per_minute` (Number) Input and output tokens allowed per rolling minute, counted when each request completes.
- `concurrent_requests` (Number) Requests allowed in progress at once. A request holds a slot until its response has been sent in full.
- `fail_closed` (Boolean) Strict mode. The limits are checked before each request is sent, and requests are rejected when they cannot be checked. Exact, but adds latency. Defaults to `false`.

Removing a limit from the configuration removes it from the policy.

### Read-only

- `id` (String) Policy identifier.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

```shell
terraform import phaseo_rate_limit_policy.standard 11111111-1111-4111-8111-111111111111
```
