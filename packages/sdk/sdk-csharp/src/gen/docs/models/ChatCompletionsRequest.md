# AIStatsSdk.Model.ChatCompletionsRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Messages** | [**List&lt;ChatMessage&gt;**](ChatMessage.md) |  | 
**System** | **string** |  | [optional] 
**Reasoning** | [**ReasoningConfig**](ReasoningConfig.md) |  | [optional] 
**FrequencyPenalty** | **decimal** |  | [optional] 
**LogitBias** | **Dictionary&lt;string, decimal&gt;** |  | [optional] 
**MaxOutputTokens** | **int** |  | [optional] 
**Meta** | **bool** |  | [optional] [default to false]
**Debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] 
**PresencePenalty** | **decimal** |  | [optional] 
**Seed** | **long** |  | [optional] 
**Stream** | **bool** |  | [optional] [default to false]
**Temperature** | **decimal** |  | [optional] [default to 1M]
**Tools** | [**List&lt;ChatCompletionsRequestToolsInner&gt;**](ChatCompletionsRequestToolsInner.md) |  | [optional] 
**MaxToolCalls** | **int** |  | [optional] 
**ParallelToolCalls** | **bool** |  | [optional] [default to true]
**ToolChoice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**TopK** | **int** |  | [optional] 
**Logprobs** | **bool** |  | [optional] [default to false]
**TopLogprobs** | **int** |  | [optional] 
**TopP** | **decimal** |  | [optional] 
**ResponseFormat** | [**ChatCompletionsRequestResponseFormat**](ChatCompletionsRequestResponseFormat.md) |  | [optional] 
**Usage** | **bool** |  | [optional] 
**Provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 
**UserId** | **string** |  | [optional] 
**ServiceTier** | **string** |  | [optional] [default to ServiceTierEnum.Standard]

[[Back to Model list]](../../README.md#documentation-for-models) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to README]](../../README.md)

