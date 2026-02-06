# AIStatsSdk::DebugResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **enabled** | **Boolean** |  | [optional] |
| **return_upstream_request** | **Boolean** |  | [optional] |
| **return_upstream_response** | **Boolean** |  | [optional] |
| **trace_level** | **String** |  | [optional] |
| **trace** | **Array&lt;Hash&lt;String, Object&gt;&gt;** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::DebugResponse.new(
  enabled: null,
  return_upstream_request: null,
  return_upstream_response: null,
  trace_level: null,
  trace: null
)
```

