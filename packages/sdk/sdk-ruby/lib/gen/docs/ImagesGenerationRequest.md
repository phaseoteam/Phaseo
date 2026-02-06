# AIStatsSdk::ImagesGenerationRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **prompt** | **String** |  |  |
| **size** | **String** |  | [optional] |
| **n** | **Integer** |  | [optional] |
| **quality** | **String** |  | [optional] |
| **response_format** | **String** |  | [optional] |
| **style** | **String** |  | [optional] |
| **user** | **String** |  | [optional] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ImagesGenerationRequest.new(
  model: null,
  prompt: null,
  size: null,
  n: null,
  quality: null,
  response_format: null,
  style: null,
  user: null,
  debug: null,
  provider: null
)
```

