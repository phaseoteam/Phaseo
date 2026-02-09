# # AnthropicMessagesRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**model** | **string** |  |
**system** | [**\AIStats\Sdk\Model\AnthropicMessagesRequestSystem**](AnthropicMessagesRequestSystem.md) |  | [optional]
**messages** | [**\AIStats\Sdk\Model\AnthropicMessage[]**](AnthropicMessage.md) |  |
**max_tokens** | **int** |  | [optional]
**temperature** | **float** |  | [optional]
**top_p** | **float** |  | [optional]
**top_k** | **int** |  | [optional]
**tools** | [**\AIStats\Sdk\Model\AnthropicTool[]**](AnthropicTool.md) |  | [optional]
**tool_choice** | [**\AIStats\Sdk\Model\ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional]
**stream** | **bool** |  | [optional]
**metadata** | **array<string,string>** |  | [optional]
**debug** | [**\AIStats\Sdk\Model\DebugOptions**](DebugOptions.md) |  | [optional]
**provider** | [**\AIStats\Sdk\Model\ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional]

[[Back to Model list]](../../README.md#models) [[Back to API list]](../../README.md#endpoints) [[Back to README]](../../README.md)
