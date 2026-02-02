# AIStatsSdk::ListProvisioningKeys200Response

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **ok** | **Boolean** |  | [optional] |
| **limit** | **Integer** |  | [optional] |
| **offset** | **Integer** |  | [optional] |
| **total** | **Integer** |  | [optional] |
| **keys** | [**Array&lt;ProvisioningKey&gt;**](ProvisioningKey.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ListProvisioningKeys200Response.new(
  ok: true,
  limit: 50,
  offset: 0,
  total: 3,
  keys: null
)
```

