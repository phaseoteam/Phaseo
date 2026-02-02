# AIStatsSdk::CreateProvisioningKeyRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **team_id** | **String** | The team ID this key belongs to |  |
| **name** | **String** | A descriptive name for the key |  |
| **scopes** | **String** | Comma-separated list of scopes | [optional][default to &#39;read,write&#39;] |
| **created_by** | **String** | The user ID creating this key |  |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::CreateProvisioningKeyRequest.new(
  team_id: null,
  name: null,
  scopes: null,
  created_by: null
)
```

