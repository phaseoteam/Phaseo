---
page_title: "phaseo_scim_group_mapping Resource"
description: |-
  Maps a provisioned SCIM group to a Phaseo department and workspace role.
---

# phaseo_scim_group_mapping

```terraform
resource "phaseo_scim_group_mapping" "engineering" {
  scim_group_id       = "scim-group-id"
  department_id       = "department-id"
  access_role         = "member"
  department_position = "member"
}
```

Maps a provisioned SCIM group to a Phaseo department and workspace access role.

## Schema

### Required

- `scim_group_id` (String) SCIM group identifier. Changing it replaces the mapping.
- `department_id` (String) Phaseo department identifier. Changing it replaces the mapping.

### Optional

- `access_role` (String) Workspace access role: `member` or `admin`.
- `department_position` (String) Department position: `member` or `lead`.

### Read-only

- `id` (String) Mapping identifier.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

Import a mapping using its UUID.

```shell
terraform import phaseo_scim_group_mapping.engineering 11111111-1111-4111-8111-111111111111
```
