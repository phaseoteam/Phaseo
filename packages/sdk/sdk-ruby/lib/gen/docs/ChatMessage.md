# AIStatsSdk::ChatMessage

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **role** | **String** |  |  |
| **content** | [**ChatMessageContent**](ChatMessageContent.md) |  | [optional] |
| **name** | **String** |  | [optional] |
| **tool_calls** | [**Array&lt;ToolCall&gt;**](ToolCall.md) |  | [optional] |
| **tool_call_id** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ChatMessage.new(
  role: null,
  content: null,
  name: null,
  tool_calls: null,
  tool_call_id: null
)
```

