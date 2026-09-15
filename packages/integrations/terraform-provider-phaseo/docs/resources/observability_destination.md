---
page_title: "phaseo_observability_destination Resource"
description: |-
  Manages a Phaseo observability export destination.
---

# phaseo_observability_destination

```terraform
resource "phaseo_observability_destination" "otel" {
  type   = "otel_collector"
  name   = "Production telemetry"
  config = {
    endpoint = var.otel_endpoint
  }
}
```

Creates an observability export destination for Phaseo telemetry. The `config` map is write-only and sensitive; keep destination credentials in secret variables and use encrypted state.

## Schema

### Required

- `type` (String) Destination type: `otel_collector` or `webhook`. Changing it replaces the destination.
- `name` (String) Destination name.
- `config` (Map of String, Sensitive) Write-only destination configuration.

### Optional

- `enabled` (Boolean) Whether exports are enabled.
- `privacy_mode` (Boolean) Whether privacy mode is enabled.
- `sampling_rate` (Number) Fraction of events to export, from `0.0001` through `1`.
- `group_join` (String) Grouping behavior for exported events: `and` or `or`.
- `include_generation_metadata` (Boolean) Include generation metadata.
- `include_cost_metadata` (Boolean) Include cost metadata.
- `include_identity_metadata` (Boolean) Include identity metadata.
- `include_request_context` (Boolean) Include request context.

### Read-only

- `id` (String) Destination identifier.
- `workspace_id` (String) Workspace identifier.
- `configured` (Boolean) Whether the destination is configured.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

Observability destinations cannot be imported because Phaseo does not return their write-only configuration.
