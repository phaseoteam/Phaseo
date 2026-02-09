# AIStatsSdk::BatchRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **input_file_id** | **String** |  |  |
| **endpoint** | **String** |  |  |
| **completion_window** | **String** |  | [optional] |
| **metadata** | **Object** |  | [optional] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::BatchRequest.new(
  input_file_id: null,
  endpoint: null,
  completion_window: null,
  metadata: null,
  debug: null,
  provider: null
)
```

