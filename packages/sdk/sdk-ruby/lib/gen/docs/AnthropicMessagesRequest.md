# AIStatsSdk::AnthropicMessagesRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **system** | [**AnthropicMessagesRequestSystem**](AnthropicMessagesRequestSystem.md) |  | [optional] |
| **messages** | [**Array&lt;AnthropicMessage&gt;**](AnthropicMessage.md) |  |  |
| **max_tokens** | **Integer** |  |  |
| **temperature** | **Float** |  | [optional] |
| **top_p** | **Float** |  | [optional] |
| **top_k** | **Integer** |  | [optional] |
| **tools** | [**Array&lt;AnthropicTool&gt;**](AnthropicTool.md) |  | [optional] |
| **tool_choice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] |
| **stream** | **Boolean** |  | [optional] |
| **stop_sequences** | **Array&lt;String&gt;** |  | [optional] |
| **modalities** | **Array&lt;String&gt;** |  | [optional] |
| **metadata** | **Hash&lt;String, String&gt;** |  | [optional] |
| **meta** | **Boolean** |  | [optional] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |
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
  stop_sequences: null,
  modalities: null,
  metadata: null,
  meta: null,
  debug: null,
  provider: null
)
```

