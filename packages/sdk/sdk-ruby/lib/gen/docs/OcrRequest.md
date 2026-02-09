# AIStatsSdk::OcrRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **image** | **String** |  |  |
| **language** | **String** |  | [optional] |
| **echo_upstream_request** | **Boolean** |  | [optional] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::OcrRequest.new(
  model: null,
  image: null,
  language: null,
  echo_upstream_request: null,
  debug: null,
  provider: null
)
```

