# AIStatsSdk::ResponsesRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **input** | **Object** |  | [optional] |
| **input_items** | **Array&lt;Object&gt;** |  | [optional] |
| **conversation** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] |
| **include** | **Array&lt;String&gt;** |  | [optional] |
| **instructions** | **String** |  | [optional] |
| **max_output_tokens** | **Integer** |  | [optional] |
| **max_tool_calls** | **Integer** |  | [optional] |
| **metadata** | **Hash&lt;String, String&gt;** |  | [optional] |
| **parallel_tool_calls** | **Boolean** |  | [optional] |
| **previous_response_id** | **String** |  | [optional] |
| **prompt** | [**ResponsesRequestPrompt**](ResponsesRequestPrompt.md) |  | [optional] |
| **prompt_cache_key** | **String** |  | [optional] |
| **prompt_cache_retention** | **String** |  | [optional] |
| **reasoning** | [**ResponsesRequestReasoning**](ResponsesRequestReasoning.md) |  | [optional] |
| **safety_identifier** | **String** |  | [optional] |
| **service_tier** | **String** |  | [optional] |
| **store** | **Boolean** |  | [optional] |
| **stream** | **Boolean** |  | [optional] |
| **stream_options** | **Object** |  | [optional] |
| **temperature** | **Float** |  | [optional] |
| **text** | **Object** |  | [optional] |
| **tool_choice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] |
| **tools** | **Array&lt;Object&gt;** |  | [optional] |
| **top_logprobs** | **Integer** |  | [optional] |
| **top_p** | **Float** |  | [optional] |
| **truncation** | **String** |  | [optional] |
| **background** | **Boolean** |  | [optional] |
| **user** | **String** |  | [optional] |
| **usage** | **Boolean** |  | [optional] |
| **meta** | **Boolean** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ResponsesRequest.new(
  model: null,
  input: null,
  input_items: null,
  conversation: null,
  include: null,
  instructions: null,
  max_output_tokens: null,
  max_tool_calls: null,
  metadata: null,
  parallel_tool_calls: null,
  previous_response_id: null,
  prompt: null,
  prompt_cache_key: null,
  prompt_cache_retention: null,
  reasoning: null,
  safety_identifier: null,
  service_tier: null,
  store: null,
  stream: null,
  stream_options: null,
  temperature: null,
  text: null,
  tool_choice: null,
  tools: null,
  top_logprobs: null,
  top_p: null,
  truncation: null,
  background: null,
  user: null,
  usage: null,
  meta: null,
  provider: null
)
```

