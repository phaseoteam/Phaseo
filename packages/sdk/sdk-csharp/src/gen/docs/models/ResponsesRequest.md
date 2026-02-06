# AIStatsSdk.Model.ResponsesRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Input** | [**ResponsesRequestInput**](ResponsesRequestInput.md) |  | [optional] 
**Messages** | [**List&lt;ChatMessage&gt;**](ChatMessage.md) |  | [optional] 
**InputItems** | [**List&lt;ResponsesInputItem&gt;**](ResponsesInputItem.md) |  | [optional] 
**Conversation** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Include** | **List&lt;string&gt;** |  | [optional] 
**Instructions** | **string** |  | [optional] 
**MaxOutputTokens** | **int** |  | [optional] 
**MaxToolCalls** | **int** |  | [optional] 
**MaxToolsCalls** | **int** |  | [optional] 
**Metadata** | **Dictionary&lt;string, string&gt;** |  | [optional] 
**Debug** | [**DebugOptions**](DebugOptions.md) |  | [optional] 
**ParallelToolCalls** | **bool** |  | [optional] 
**PreviousResponseId** | **string** |  | [optional] 
**Prompt** | [**ResponsesRequestPrompt**](ResponsesRequestPrompt.md) |  | [optional] 
**PromptCacheKey** | **string** |  | [optional] 
**PromptCacheRetention** | **string** |  | [optional] 
**Modalities** | **List&lt;ResponsesRequest.ModalitiesEnum&gt;** |  | [optional] 
**Reasoning** | [**ResponsesRequestReasoning**](ResponsesRequestReasoning.md) |  | [optional] 
**SafetyIdentifier** | **string** |  | [optional] 
**ServiceTier** | **string** |  | [optional] 
**Store** | **bool** |  | [optional] 
**Stream** | **bool** |  | [optional] 
**StreamOptions** | **Object** |  | [optional] 
**Temperature** | **decimal** |  | [optional] 
**Text** | **Object** |  | [optional] 
**ToolChoice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Tools** | **List&lt;Object&gt;** |  | [optional] 
**TopLogprobs** | **int** |  | [optional] 
**TopP** | **decimal** |  | [optional] 
**Truncation** | **string** |  | [optional] 
**Background** | **bool** |  | [optional] 
**User** | **string** |  | [optional] 
**Meta** | **bool** |  | [optional] 
**Provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

[[Back to Model list]](../../README.md#documentation-for-models) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to README]](../../README.md)

