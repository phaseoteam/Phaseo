# AIStatsSdk::ModerationsRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **meta** | **Boolean** |  | [optional][default to false] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |
| **input** | [**ModerationsRequestInput**](ModerationsRequestInput.md) |  |  |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ModerationsRequest.new(
  model: null,
  meta: null,
  debug: null,
  input: null,
  provider: null
)
```

