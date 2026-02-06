# AIStatsSdk::ChatCompletionsStreamChoice

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **index** | **Integer** |  | [optional] |
| **delta** | [**ChatCompletionsStreamDelta**](ChatCompletionsStreamDelta.md) |  | [optional] |
| **finish_reason** | **String** |  | [optional] |
| **logprobs** | **Object** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ChatCompletionsStreamChoice.new(
  index: null,
  delta: null,
  finish_reason: null,
  logprobs: null
)
```

