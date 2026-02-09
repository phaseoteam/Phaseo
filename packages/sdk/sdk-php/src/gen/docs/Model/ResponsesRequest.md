# # ResponsesRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**model** | **string** |  |
**input** | **object** |  | [optional]
**input_items** | **object[]** |  | [optional]
**conversation** | [**\AIStats\Sdk\Model\ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional]
**include** | **string[]** |  | [optional]
**instructions** | **string** |  | [optional]
**max_output_tokens** | **int** |  | [optional]
**max_tool_calls** | **int** |  | [optional]
**metadata** | **array<string,string>** |  | [optional]
**parallel_tool_calls** | **bool** |  | [optional]
**previous_response_id** | **string** |  | [optional]
**prompt** | [**\AIStats\Sdk\Model\ResponsesRequestPrompt**](ResponsesRequestPrompt.md) |  | [optional]
**prompt_cache_key** | **string** |  | [optional]
**prompt_cache_retention** | **string** |  | [optional]
**reasoning** | [**\AIStats\Sdk\Model\ResponsesRequestReasoning**](ResponsesRequestReasoning.md) |  | [optional]
**safety_identifier** | **string** |  | [optional]
**service_tier** | **string** |  | [optional]
**store** | **bool** |  | [optional]
**stream** | **bool** |  | [optional]
**stream_options** | **object** |  | [optional]
**temperature** | **float** |  | [optional]
**text** | **object** |  | [optional]
**tool_choice** | [**\AIStats\Sdk\Model\ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional]
**tools** | **object[]** |  | [optional]
**top_logprobs** | **int** |  | [optional]
**top_p** | **float** |  | [optional]
**truncation** | **string** |  | [optional]
**background** | **bool** |  | [optional]
**user** | **string** |  | [optional]
**usage** | **bool** |  | [optional]
**meta** | **bool** |  | [optional]
**debug** | [**\AIStats\Sdk\Model\DebugOptions**](DebugOptions.md) |  | [optional]
**provider** | [**\AIStats\Sdk\Model\ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional]

[[Back to Model list]](../../README.md#models) [[Back to API list]](../../README.md#endpoints) [[Back to README]](../../README.md)
