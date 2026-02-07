# # ChatCompletionsRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**model** | **string** |  |
**system** | **string** |  | [optional]
**messages** | [**\AIStats\Sdk\Model\ChatMessage[]**](ChatMessage.md) |  |
**reasoning** | [**\AIStats\Sdk\Model\ReasoningConfig**](ReasoningConfig.md) |  | [optional]
**frequency_penalty** | **float** |  | [optional]
**logit_bias** | **array<string,float>** |  | [optional]
**max_output_tokens** | **int** |  | [optional]
**meta** | **bool** |  | [optional] [default to false]
**presence_penalty** | **float** |  | [optional]
**seed** | **int** |  | [optional]
**stream** | **bool** |  | [optional] [default to false]
**temperature** | **float** |  | [optional] [default to 1]
**tools** | [**\AIStats\Sdk\Model\ChatCompletionsRequestToolsInner[]**](ChatCompletionsRequestToolsInner.md) |  | [optional]
**max_tool_calls** | **int** |  | [optional]
**parallel_tool_calls** | **bool** |  | [optional] [default to true]
**tool_choice** | [**\AIStats\Sdk\Model\ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional]
**top_k** | **int** |  | [optional]
**logprobs** | **bool** |  | [optional] [default to false]
**top_logprobs** | **int** |  | [optional]
**top_p** | **float** |  | [optional]
**response_format** | [**\AIStats\Sdk\Model\ChatCompletionsRequestResponseFormat**](ChatCompletionsRequestResponseFormat.md) |  | [optional]
**usage** | **bool** |  | [optional]
**provider** | [**\AIStats\Sdk\Model\ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional]
**user_id** | **string** |  | [optional]
**service_tier** | **string** |  | [optional] [default to 'standard']

[[Back to Model list]](../../README.md#models) [[Back to API list]](../../README.md#endpoints) [[Back to README]](../../README.md)
