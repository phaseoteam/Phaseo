# AIStatsSdk::VideoGenerationRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **prompt** | **String** |  |  |
| **duration** | **Integer** |  | [optional] |
| **ratio** | **String** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::VideoGenerationRequest.new(
  model: null,
  prompt: null,
  duration: null,
  ratio: null,
  provider: null
)
```

