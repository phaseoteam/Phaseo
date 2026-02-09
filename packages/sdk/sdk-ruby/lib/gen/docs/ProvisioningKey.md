# AIStatsSdk::ProvisioningKey

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **name** | **String** |  | [optional] |
| **prefix** | **String** |  | [optional] |
| **status** | **String** |  | [optional] |
| **scopes** | **String** |  | [optional] |
| **created_at** | **Time** |  | [optional] |
| **last_used_at** | **Time** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ProvisioningKey.new(
  id: 11111111-1111-4111-8111-111111111111,
  name: Production Key,
  prefix: pk_abc123,
  status: active,
  scopes: read,write,
  created_at: 2026-01-01T00:00Z,
  last_used_at: 2026-01-20T10:30Z
)
```

