# AIStatsSdk::ChatCompletionsStreamChunk

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **native_response_id** | **String** |  | [optional] |
| **object** | **String** |  | [optional] |
| **created** | **Integer** |  | [optional] |
| **model** | **String** |  | [optional] |
| **system_fingerprint** | **String** |  | [optional] |
| **service_tier** | **String** |  | [optional] |
| **choices** | [**Array&lt;ChatCompletionsStreamChoice&gt;**](ChatCompletionsStreamChoice.md) |  | [optional] |
| **usage** | [**Usage**](Usage.md) |  | [optional] |
| **meta** | **Object** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ChatCompletionsStreamChunk.new(
  id: null,
  native_response_id: null,
  object: null,
  created: null,
  model: null,
  system_fingerprint: null,
  service_tier: null,
  choices: null,
  usage: null,
  meta: null
)
```

