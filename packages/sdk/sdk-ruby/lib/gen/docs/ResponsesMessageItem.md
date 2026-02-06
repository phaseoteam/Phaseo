# AIStatsSdk::ResponsesMessageItem

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **type** | **String** |  |  |
| **role** | **String** |  |  |
| **content** | [**ChatMessageContent**](ChatMessageContent.md) |  |  |
| **tool_calls** | [**Array&lt;ToolCall&gt;**](ToolCall.md) |  | [optional] |
| **tool_call_id** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ResponsesMessageItem.new(
  type: null,
  role: null,
  content: null,
  tool_calls: null,
  tool_call_id: null
)
```

