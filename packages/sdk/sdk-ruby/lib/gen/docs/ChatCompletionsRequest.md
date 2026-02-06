# AIStatsSdk::ChatCompletionsRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **system** | **String** |  | [optional] |
| **messages** | [**Array&lt;ChatMessage&gt;**](ChatMessage.md) |  |  |
| **reasoning** | [**ReasoningConfig**](ReasoningConfig.md) |  | [optional] |
| **frequency_penalty** | **Float** |  | [optional] |
| **logit_bias** | **Hash&lt;String, Float&gt;** |  | [optional] |
| **max_output_tokens** | **Integer** |  | [optional] |
| **meta** | **Boolean** |  | [optional][default to false] |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] |
| **presence_penalty** | **Float** |  | [optional] |
| **seed** | **Integer** |  | [optional] |
| **stream** | **Boolean** |  | [optional][default to false] |
| **temperature** | **Float** |  | [optional][default to 1] |
| **tools** | [**Array&lt;ChatCompletionsRequestToolsInner&gt;**](ChatCompletionsRequestToolsInner.md) |  | [optional] |
| **max_tool_calls** | **Integer** |  | [optional] |
| **parallel_tool_calls** | **Boolean** |  | [optional][default to true] |
| **tool_choice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] |
| **top_k** | **Integer** |  | [optional] |
| **logprobs** | **Boolean** |  | [optional][default to false] |
| **top_logprobs** | **Integer** |  | [optional] |
| **top_p** | **Float** |  | [optional] |
| **response_format** | [**ChatCompletionsRequestResponseFormat**](ChatCompletionsRequestResponseFormat.md) |  | [optional] |
| **modalities** | **Array&lt;String&gt;** |  | [optional] |
| **usage** | **Boolean** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |
| **user_id** | **String** |  | [optional] |
| **service_tier** | **String** |  | [optional][default to &#39;standard&#39;] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ChatCompletionsRequest.new(
  model: null,
  system: null,
  messages: null,
  reasoning: null,
  frequency_penalty: null,
  logit_bias: null,
  max_output_tokens: null,
  meta: null,
  debug: null,
  presence_penalty: null,
  seed: null,
  stream: null,
  temperature: null,
  tools: null,
  max_tool_calls: null,
  parallel_tool_calls: null,
  tool_choice: null,
  top_k: null,
  logprobs: null,
  top_logprobs: null,
  top_p: null,
  response_format: null,
  modalities: null,
  usage: null,
  provider: null,
  user_id: null,
  service_tier: null
)
```

