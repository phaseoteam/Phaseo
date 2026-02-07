# AIStatsSdk::AnthropicMessagesRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **system** | [**AnthropicMessagesRequestSystem**](AnthropicMessagesRequestSystem.md) |  | [optional] |
| **messages** | [**Array&lt;AnthropicMessage&gt;**](AnthropicMessage.md) |  |  |
| **max_tokens** | **Integer** |  | [optional] |
| **temperature** | **Float** |  | [optional] |
| **top_p** | **Float** |  | [optional] |
| **top_k** | **Integer** |  | [optional] |
| **tools** | [**Array&lt;AnthropicTool&gt;**](AnthropicTool.md) |  | [optional] |
| **tool_choice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] |
| **stream** | **Boolean** |  | [optional] |
| **metadata** | **Hash&lt;String, String&gt;** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::AnthropicMessagesRequest.new(
  model: null,
  system: null,
  messages: null,
  max_tokens: null,
  temperature: null,
  top_p: null,
  top_k: null,
  tools: null,
  tool_choice: null,
  stream: null,
  metadata: null,
  provider: null
)
```

