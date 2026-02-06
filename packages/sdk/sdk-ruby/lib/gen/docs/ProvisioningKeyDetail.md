# AIStatsSdk::ProvisioningKeyDetail

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **team_id** | **String** |  | [optional] |
| **name** | **String** |  | [optional] |
| **prefix** | **String** |  | [optional] |
| **status** | **String** |  | [optional] |
| **scopes** | **String** |  | [optional] |
| **created_by** | **String** |  | [optional] |
| **created_at** | **Time** |  | [optional] |
| **last_used_at** | **Time** |  | [optional] |
| **soft_blocked** | **Boolean** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ProvisioningKeyDetail.new(
  id: null,
  team_id: null,
  name: Production Key,
  prefix: pk_abc123,
  status: active,
  scopes: read,write,
  created_by: null,
  created_at: 2026-01-01T00:00Z,
  last_used_at: 2026-01-20T10:30Z,
  soft_blocked: false
)
```

