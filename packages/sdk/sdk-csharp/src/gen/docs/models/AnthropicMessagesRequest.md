# AIStatsSdk.Model.AnthropicMessagesRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Messages** | [**List&lt;AnthropicMessage&gt;**](AnthropicMessage.md) |  | 
**MaxTokens** | **int** |  | 
**System** | [**AnthropicMessagesRequestSystem**](AnthropicMessagesRequestSystem.md) |  | [optional] 
**Temperature** | **decimal** |  | [optional] 
**TopP** | **decimal** |  | [optional] 
**TopK** | **int** |  | [optional] 
**Tools** | [**List&lt;AnthropicTool&gt;**](AnthropicTool.md) |  | [optional] 
**ToolChoice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Stream** | **bool** |  | [optional] 
**StopSequences** | **List&lt;string&gt;** |  | [optional] 
**Modalities** | **List&lt;AnthropicMessagesRequest.ModalitiesEnum&gt;** |  | [optional] 
**Metadata** | **Dictionary&lt;string, string&gt;** |  | [optional] 
**Meta** | **bool** |  | [optional] 
**Debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] 
**Provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

[[Back to Model list]](../../README.md#documentation-for-models) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to README]](../../README.md)

