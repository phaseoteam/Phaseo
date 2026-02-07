# AIStatsSdk.Model.AnthropicMessagesRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Messages** | [**List&lt;AnthropicMessage&gt;**](AnthropicMessage.md) |  | 
**System** | [**AnthropicMessagesRequestSystem**](AnthropicMessagesRequestSystem.md) |  | [optional] 
**MaxTokens** | **int** |  | [optional] 
**Temperature** | **decimal** |  | [optional] 
**TopP** | **decimal** |  | [optional] 
**TopK** | **int** |  | [optional] 
**Tools** | [**List&lt;AnthropicTool&gt;**](AnthropicTool.md) |  | [optional] 
**ToolChoice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Stream** | **bool** |  | [optional] 
**Metadata** | **Dictionary&lt;string, string&gt;** |  | [optional] 
**Provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

[[Back to Model list]](../../README.md#documentation-for-models) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to README]](../../README.md)

