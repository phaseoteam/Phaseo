# AIStatsSdk::ChatCompletionsResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **native_response_id** | **String** |  | [optional] |
| **object** | **String** |  | [optional] |
| **created** | **Integer** |  | [optional] |
| **model** | **String** |  | [optional] |
| **choices** | [**Array&lt;ChatChoice&gt;**](ChatChoice.md) |  | [optional] |
| **usage** | [**Usage**](Usage.md) |  | [optional] |
| **service_tier** | **String** |  | [optional] |
| **system_fingerprint** | **String** |  | [optional] |
| **meta** | **Object** |  | [optional] |
| **debug** | [**DebugResponse**](DebugResponse.md) |  | [optional] |
| **upstream_request** | [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] |
| **upstream_response** | [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ChatCompletionsResponse.new(
  id: null,
  native_response_id: null,
  object: null,
  created: null,
  model: null,
  choices: null,
  usage: null,
  service_tier: null,
  system_fingerprint: null,
  meta: null,
  debug: null,
  upstream_request: null,
  upstream_response: null
)
```

