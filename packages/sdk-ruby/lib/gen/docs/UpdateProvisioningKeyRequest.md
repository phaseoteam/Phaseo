# AIStatsSdk::UpdateProvisioningKeyRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **name** | **String** | New name for the key | [optional] |
| **status** | **String** | New status for the key | [optional] |
| **soft_blocked** | **Boolean** | Whether to temporarily block the key | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::UpdateProvisioningKeyRequest.new(
  name: null,
  status: null,
  soft_blocked: null
)
```

