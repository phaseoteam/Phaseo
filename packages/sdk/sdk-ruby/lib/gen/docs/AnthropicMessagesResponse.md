# AIStatsSdk::AnthropicMessagesResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **type** | **String** |  | [optional] |
| **role** | **String** |  | [optional] |
| **model** | **String** |  | [optional] |
| **content** | [**Array&lt;AnthropicContentBlock&gt;**](AnthropicContentBlock.md) |  | [optional] |
| **stop_reason** | **String** |  | [optional] |
| **stop_sequence** | **String** |  | [optional] |
| **usage** | [**AnthropicUsage**](AnthropicUsage.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::AnthropicMessagesResponse.new(
  id: null,
  type: null,
  role: null,
  model: null,
  content: null,
  stop_reason: null,
  stop_sequence: null,
  usage: null
)
```

