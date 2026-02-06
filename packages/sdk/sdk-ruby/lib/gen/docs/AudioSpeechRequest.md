# AIStatsSdk::AudioSpeechRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **input** | **String** |  |  |
| **voice** | **String** |  | [optional] |
| **format** | **String** |  | [optional] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::AudioSpeechRequest.new(
  model: null,
  input: null,
  voice: null,
  format: null,
  debug: null,
  provider: null
)
```

