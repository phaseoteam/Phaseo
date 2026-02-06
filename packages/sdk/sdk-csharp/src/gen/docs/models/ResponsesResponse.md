# AIStatsSdk.Model.ResponsesResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | **string** |  | [optional] 
**Object** | **string** |  | [optional] 
**CreatedAt** | **int** |  | [optional] 
**Status** | **string** |  | [optional] 
**CompletedAt** | **int** |  | [optional] 
**Error** | **Object** |  | [optional] 
**IncompleteDetails** | **Object** |  | [optional] 
**Instructions** | **string** |  | [optional] 
**MaxOutputTokens** | **int** |  | [optional] 
**MaxToolCalls** | **int** |  | [optional] 
**Model** | **string** |  | [optional] 
**Output** | [**List&lt;ResponsesOutputItem&gt;**](ResponsesOutputItem.md) |  | [optional] 
**ParallelToolCalls** | **bool** |  | [optional] 
**PreviousResponseId** | **string** |  | [optional] 
**Reasoning** | [**ResponsesResponseReasoning**](ResponsesResponseReasoning.md) |  | [optional] 
**FrequencyPenalty** | **decimal** |  | [optional] 
**PresencePenalty** | **decimal** |  | [optional] 
**Store** | **bool** |  | [optional] 
**Temperature** | **decimal** |  | [optional] 
**Text** | **Object** |  | [optional] 
**ToolChoice** | [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Tools** | **List&lt;Object&gt;** |  | [optional] 
**TopLogprobs** | **int** |  | [optional] 
**TopP** | **decimal** |  | [optional] 
**Truncation** | **string** |  | [optional] 
**User** | **string** |  | [optional] 
**Background** | **bool** |  | [optional] 
**ServiceTier** | **string** |  | [optional] 
**SafetyIdentifier** | **string** |  | [optional] 
**PromptCacheKey** | **string** |  | [optional] 
**Metadata** | **Object** |  | [optional] 
**NativeResponseId** | **string** |  | [optional] 
**Meta** | **Object** |  | [optional] 
**Debug** | [**DebugResponse**](DebugResponse.md) |  | [optional] 
**UpstreamRequest** | [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] 
**UpstreamResponse** | [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] 
**Usage** | [**Usage**](Usage.md) |  | [optional] 

[[Back to Model list]](../../README.md#documentation-for-models) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to README]](../../README.md)

