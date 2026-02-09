# AIStatsSdk::ProvisioningKeyWithValue

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **name** | **String** |  | [optional] |
| **prefix** | **String** |  | [optional] |
| **status** | **String** |  | [optional] |
| **scopes** | **String** |  | [optional] |
| **created_at** | **Time** |  | [optional] |
| **key** | **String** | The raw management API key. Only returned on creation. | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ProvisioningKeyWithValue.new(
  id: 11111111-1111-4111-8111-111111111111,
  name: My New Key,
  prefix: pk_abc123xy,
  status: active,
  scopes: read,write,
  created_at: 2026-01-20T10:30Z,
  key: pk_abc123xy_abc123def456...
)
```

