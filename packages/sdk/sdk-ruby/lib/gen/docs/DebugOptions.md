# AIStatsSdk::DebugOptions

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **enabled** | **Boolean** | Enable debug mode for the request. | [optional] |
| **return_upstream_request** | **Boolean** | Include the upstream request payload in the response. | [optional] |
| **return_upstream_response** | **Boolean** | Include the upstream response payload in the response. | [optional] |
| **trace** | **Boolean** | Include a redacted field-level mapping trace under response debug.trace. | [optional] |
| **trace_level** | **String** | Controls trace detail level. | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::DebugOptions.new(
  enabled: null,
  return_upstream_request: null,
  return_upstream_response: null,
  trace: null,
  trace_level: null
)
```

