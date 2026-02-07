# AIStatsSdk::ModerationsRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **meta** | **Boolean** |  | [optional][default to false] |
| **input** | [**ModerationsRequestInput**](ModerationsRequestInput.md) |  |  |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ModerationsRequest.new(
  model: null,
  meta: null,
  input: null,
  provider: null
)
```

