# AIStatsSdk::GenerationResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **request_id** | **String** |  | [optional] |
| **team_id** | **String** |  | [optional] |
| **app_id** | **String** |  | [optional] |
| **endpoint** | **String** |  | [optional] |
| **model_id** | **String** |  | [optional] |
| **provider** | **String** |  | [optional] |
| **native_response_id** | **String** |  | [optional] |
| **stream** | **Boolean** |  | [optional] |
| **byok** | **Boolean** |  | [optional] |
| **status_code** | **Float** |  | [optional] |
| **success** | **Boolean** |  | [optional] |
| **error_code** | **String** |  | [optional] |
| **error_message** | **String** |  | [optional] |
| **latency_ms** | **Float** |  | [optional] |
| **generation_ms** | **Float** |  | [optional] |
| **usage** | [**GenerationResponseUsage**](GenerationResponseUsage.md) |  | [optional] |
| **cost_nanos** | **Float** |  | [optional] |
| **currency** | **String** |  | [optional] |
| **pricing_lines** | **Array&lt;Object&gt;** |  | [optional] |
| **key_id** | **String** |  | [optional] |
| **throughput** | **Float** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::GenerationResponse.new(
  request_id: null,
  team_id: null,
  app_id: null,
  endpoint: null,
  model_id: null,
  provider: null,
  native_response_id: null,
  stream: null,
  byok: null,
  status_code: null,
  success: null,
  error_code: null,
  error_message: null,
  latency_ms: null,
  generation_ms: null,
  usage: null,
  cost_nanos: null,
  currency: null,
  pricing_lines: null,
  key_id: null,
  throughput: null
)
```

