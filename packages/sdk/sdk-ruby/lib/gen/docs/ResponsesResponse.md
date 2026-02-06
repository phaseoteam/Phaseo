# AIStatsSdk::ResponsesResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **object** | **String** |  | [optional] |
| **created_at** | **Integer** |  | [optional] |
| **status** | **String** |  | [optional] |
| **completed_at** | **Integer** |  | [optional] |
| **error** | **Object** |  | [optional] |
| **incomplete_details** | **Object** |  | [optional] |
| **instructions** | **String** |  | [optional] |
| **max_output_tokens** | **Integer** |  | [optional] |
| **max_tool_calls** | **Integer** |  | [optional] |
| **model** | **String** |  | [optional] |
| **output** | [**Array&lt;ResponsesOutputItem&gt;**](ResponsesOutputItem.md) |  | [optional] |
| **parallel_tool_calls** | **Boolean** |  | [optional] |
| **previous_response_id** | **String** |  | [optional] |
| **reasoning** | [**ResponsesResponseReasoning**](ResponsesResponseReasoning.md) |  | [optional] |
| **frequency_penalty** | **Float** |  | [optional] |
| **presence_penalty** | **Float** |  | [optional] |
| **store** | **Boolean** |  | [optional] |
| **temperature** | **Float** |  | [optional] |
| **text** | **Object** |  | [optional] |
| **tool_choice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] |
| **tools** | **Array&lt;Object&gt;** |  | [optional] |
| **top_logprobs** | **Integer** |  | [optional] |
| **top_p** | **Float** |  | [optional] |
| **truncation** | **String** |  | [optional] |
| **user** | **String** |  | [optional] |
| **background** | **Boolean** |  | [optional] |
| **service_tier** | **String** |  | [optional] |
| **safety_identifier** | **String** |  | [optional] |
| **prompt_cache_key** | **String** |  | [optional] |
| **metadata** | **Object** |  | [optional] |
| **native_response_id** | **String** |  | [optional] |
| **meta** | **Object** |  | [optional] |
| **debug** | [**DebugResponse**](DebugResponse.md) |  | [optional] |
| **upstream_request** | [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] |
| **upstream_response** | [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] |
| **usage** | [**Usage**](Usage.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ResponsesResponse.new(
  id: null,
  object: null,
  created_at: null,
  status: null,
  completed_at: null,
  error: null,
  incomplete_details: null,
  instructions: null,
  max_output_tokens: null,
  max_tool_calls: null,
  model: null,
  output: null,
  parallel_tool_calls: null,
  previous_response_id: null,
  reasoning: null,
  frequency_penalty: null,
  presence_penalty: null,
  store: null,
  temperature: null,
  text: null,
  tool_choice: null,
  tools: null,
  top_logprobs: null,
  top_p: null,
  truncation: null,
  user: null,
  background: null,
  service_tier: null,
  safety_identifier: null,
  prompt_cache_key: null,
  metadata: null,
  native_response_id: null,
  meta: null,
  debug: null,
  upstream_request: null,
  upstream_response: null,
  usage: null
)
```

