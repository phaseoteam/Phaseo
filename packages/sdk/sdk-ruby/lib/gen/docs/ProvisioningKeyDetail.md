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
  id: 11111111-1111-4111-8111-111111111111,
  team_id: 22222222-2222-4222-8222-222222222222,
  name: Production Key,
  prefix: pk_abc123,
  status: active,
  scopes: read,write,
  created_by: 33333333-3333-4333-8333-333333333333,
  created_at: 2026-01-01T00:00Z,
  last_used_at: 2026-01-20T10:30Z,
  soft_blocked: false
)
```

