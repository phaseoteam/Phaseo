# AIStatsSdk::ChatChoice

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **index** | **Integer** |  | [optional] |
| **message** | [**ChatMessage**](ChatMessage.md) |  | [optional] |
| **logprobs** | **Object** |  | [optional] |
| **finish_reason** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ChatChoice.new(
  index: null,
  message: null,
  logprobs: null,
  finish_reason: null
)
```

