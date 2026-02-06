# ResponsesRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Input** | Pointer to [**ResponsesRequestInput**](ResponsesRequestInput.md) |  | [optional] 
**Messages** | Pointer to [**[]ChatMessage**](ChatMessage.md) |  | [optional] 
**InputItems** | Pointer to [**[]ResponsesInputItem**](ResponsesInputItem.md) |  | [optional] 
**Conversation** | Pointer to [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Include** | Pointer to **[]string** |  | [optional] 
**Instructions** | Pointer to **string** |  | [optional] 
**MaxOutputTokens** | Pointer to **int32** |  | [optional] 
**MaxToolCalls** | Pointer to **int32** |  | [optional] 
**MaxToolsCalls** | Pointer to **int32** |  | [optional] 
**Metadata** | Pointer to **map[string]string** |  | [optional] 
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**ParallelToolCalls** | Pointer to **bool** |  | [optional] 
**PreviousResponseId** | Pointer to **string** |  | [optional] 
**Prompt** | Pointer to [**ResponsesRequestPrompt**](ResponsesRequestPrompt.md) |  | [optional] 
**PromptCacheKey** | Pointer to **string** |  | [optional] 
**PromptCacheRetention** | Pointer to **string** |  | [optional] 
**Modalities** | Pointer to **[]string** |  | [optional] 
**Reasoning** | Pointer to [**ResponsesRequestReasoning**](ResponsesRequestReasoning.md) |  | [optional] 
**SafetyIdentifier** | Pointer to **string** |  | [optional] 
**ServiceTier** | Pointer to **string** |  | [optional] 
**Store** | Pointer to **bool** |  | [optional] 
**Stream** | Pointer to **bool** |  | [optional] 
**StreamOptions** | Pointer to **map[string]interface{}** |  | [optional] 
**Temperature** | Pointer to **float32** |  | [optional] 
**Text** | Pointer to **map[string]interface{}** |  | [optional] 
**ToolChoice** | Pointer to [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Tools** | Pointer to **[]map[string]interface{}** |  | [optional] 
**TopLogprobs** | Pointer to **int32** |  | [optional] 
**TopP** | Pointer to **float32** |  | [optional] 
**Truncation** | Pointer to **string** |  | [optional] 
**Background** | Pointer to **bool** |  | [optional] 
**User** | Pointer to **string** |  | [optional] 
**Meta** | Pointer to **bool** |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewResponsesRequest

`func NewResponsesRequest(model string, ) *ResponsesRequest`

NewResponsesRequest instantiates a new ResponsesRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesRequestWithDefaults

`func NewResponsesRequestWithDefaults() *ResponsesRequest`

NewResponsesRequestWithDefaults instantiates a new ResponsesRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *ResponsesRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ResponsesRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ResponsesRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetInput

`func (o *ResponsesRequest) GetInput() ResponsesRequestInput`

GetInput returns the Input field if non-nil, zero value otherwise.

### GetInputOk

`func (o *ResponsesRequest) GetInputOk() (*ResponsesRequestInput, bool)`

GetInputOk returns a tuple with the Input field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInput

`func (o *ResponsesRequest) SetInput(v ResponsesRequestInput)`

SetInput sets Input field to given value.

### HasInput

`func (o *ResponsesRequest) HasInput() bool`

HasInput returns a boolean if a field has been set.

### GetMessages

`func (o *ResponsesRequest) GetMessages() []ChatMessage`

GetMessages returns the Messages field if non-nil, zero value otherwise.

### GetMessagesOk

`func (o *ResponsesRequest) GetMessagesOk() (*[]ChatMessage, bool)`

GetMessagesOk returns a tuple with the Messages field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMessages

`func (o *ResponsesRequest) SetMessages(v []ChatMessage)`

SetMessages sets Messages field to given value.

### HasMessages

`func (o *ResponsesRequest) HasMessages() bool`

HasMessages returns a boolean if a field has been set.

### GetInputItems

`func (o *ResponsesRequest) GetInputItems() []ResponsesInputItem`

GetInputItems returns the InputItems field if non-nil, zero value otherwise.

### GetInputItemsOk

`func (o *ResponsesRequest) GetInputItemsOk() (*[]ResponsesInputItem, bool)`

GetInputItemsOk returns a tuple with the InputItems field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputItems

`func (o *ResponsesRequest) SetInputItems(v []ResponsesInputItem)`

SetInputItems sets InputItems field to given value.

### HasInputItems

`func (o *ResponsesRequest) HasInputItems() bool`

HasInputItems returns a boolean if a field has been set.

### GetConversation

`func (o *ResponsesRequest) GetConversation() ChatCompletionsRequestToolChoice`

GetConversation returns the Conversation field if non-nil, zero value otherwise.

### GetConversationOk

`func (o *ResponsesRequest) GetConversationOk() (*ChatCompletionsRequestToolChoice, bool)`

GetConversationOk returns a tuple with the Conversation field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetConversation

`func (o *ResponsesRequest) SetConversation(v ChatCompletionsRequestToolChoice)`

SetConversation sets Conversation field to given value.

### HasConversation

`func (o *ResponsesRequest) HasConversation() bool`

HasConversation returns a boolean if a field has been set.

### GetInclude

`func (o *ResponsesRequest) GetInclude() []string`

GetInclude returns the Include field if non-nil, zero value otherwise.

### GetIncludeOk

`func (o *ResponsesRequest) GetIncludeOk() (*[]string, bool)`

GetIncludeOk returns a tuple with the Include field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInclude

`func (o *ResponsesRequest) SetInclude(v []string)`

SetInclude sets Include field to given value.

### HasInclude

`func (o *ResponsesRequest) HasInclude() bool`

HasInclude returns a boolean if a field has been set.

### GetInstructions

`func (o *ResponsesRequest) GetInstructions() string`

GetInstructions returns the Instructions field if non-nil, zero value otherwise.

### GetInstructionsOk

`func (o *ResponsesRequest) GetInstructionsOk() (*string, bool)`

GetInstructionsOk returns a tuple with the Instructions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInstructions

`func (o *ResponsesRequest) SetInstructions(v string)`

SetInstructions sets Instructions field to given value.

### HasInstructions

`func (o *ResponsesRequest) HasInstructions() bool`

HasInstructions returns a boolean if a field has been set.

### GetMaxOutputTokens

`func (o *ResponsesRequest) GetMaxOutputTokens() int32`

GetMaxOutputTokens returns the MaxOutputTokens field if non-nil, zero value otherwise.

### GetMaxOutputTokensOk

`func (o *ResponsesRequest) GetMaxOutputTokensOk() (*int32, bool)`

GetMaxOutputTokensOk returns a tuple with the MaxOutputTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxOutputTokens

`func (o *ResponsesRequest) SetMaxOutputTokens(v int32)`

SetMaxOutputTokens sets MaxOutputTokens field to given value.

### HasMaxOutputTokens

`func (o *ResponsesRequest) HasMaxOutputTokens() bool`

HasMaxOutputTokens returns a boolean if a field has been set.

### GetMaxToolCalls

`func (o *ResponsesRequest) GetMaxToolCalls() int32`

GetMaxToolCalls returns the MaxToolCalls field if non-nil, zero value otherwise.

### GetMaxToolCallsOk

`func (o *ResponsesRequest) GetMaxToolCallsOk() (*int32, bool)`

GetMaxToolCallsOk returns a tuple with the MaxToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxToolCalls

`func (o *ResponsesRequest) SetMaxToolCalls(v int32)`

SetMaxToolCalls sets MaxToolCalls field to given value.

### HasMaxToolCalls

`func (o *ResponsesRequest) HasMaxToolCalls() bool`

HasMaxToolCalls returns a boolean if a field has been set.

### GetMaxToolsCalls

`func (o *ResponsesRequest) GetMaxToolsCalls() int32`

GetMaxToolsCalls returns the MaxToolsCalls field if non-nil, zero value otherwise.

### GetMaxToolsCallsOk

`func (o *ResponsesRequest) GetMaxToolsCallsOk() (*int32, bool)`

GetMaxToolsCallsOk returns a tuple with the MaxToolsCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxToolsCalls

`func (o *ResponsesRequest) SetMaxToolsCalls(v int32)`

SetMaxToolsCalls sets MaxToolsCalls field to given value.

### HasMaxToolsCalls

`func (o *ResponsesRequest) HasMaxToolsCalls() bool`

HasMaxToolsCalls returns a boolean if a field has been set.

### GetMetadata

`func (o *ResponsesRequest) GetMetadata() map[string]string`

GetMetadata returns the Metadata field if non-nil, zero value otherwise.

### GetMetadataOk

`func (o *ResponsesRequest) GetMetadataOk() (*map[string]string, bool)`

GetMetadataOk returns a tuple with the Metadata field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMetadata

`func (o *ResponsesRequest) SetMetadata(v map[string]string)`

SetMetadata sets Metadata field to given value.

### HasMetadata

`func (o *ResponsesRequest) HasMetadata() bool`

HasMetadata returns a boolean if a field has been set.

### GetDebug

`func (o *ResponsesRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *ResponsesRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *ResponsesRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *ResponsesRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetParallelToolCalls

`func (o *ResponsesRequest) GetParallelToolCalls() bool`

GetParallelToolCalls returns the ParallelToolCalls field if non-nil, zero value otherwise.

### GetParallelToolCallsOk

`func (o *ResponsesRequest) GetParallelToolCallsOk() (*bool, bool)`

GetParallelToolCallsOk returns a tuple with the ParallelToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetParallelToolCalls

`func (o *ResponsesRequest) SetParallelToolCalls(v bool)`

SetParallelToolCalls sets ParallelToolCalls field to given value.

### HasParallelToolCalls

`func (o *ResponsesRequest) HasParallelToolCalls() bool`

HasParallelToolCalls returns a boolean if a field has been set.

### GetPreviousResponseId

`func (o *ResponsesRequest) GetPreviousResponseId() string`

GetPreviousResponseId returns the PreviousResponseId field if non-nil, zero value otherwise.

### GetPreviousResponseIdOk

`func (o *ResponsesRequest) GetPreviousResponseIdOk() (*string, bool)`

GetPreviousResponseIdOk returns a tuple with the PreviousResponseId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPreviousResponseId

`func (o *ResponsesRequest) SetPreviousResponseId(v string)`

SetPreviousResponseId sets PreviousResponseId field to given value.

### HasPreviousResponseId

`func (o *ResponsesRequest) HasPreviousResponseId() bool`

HasPreviousResponseId returns a boolean if a field has been set.

### GetPrompt

`func (o *ResponsesRequest) GetPrompt() ResponsesRequestPrompt`

GetPrompt returns the Prompt field if non-nil, zero value otherwise.

### GetPromptOk

`func (o *ResponsesRequest) GetPromptOk() (*ResponsesRequestPrompt, bool)`

GetPromptOk returns a tuple with the Prompt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrompt

`func (o *ResponsesRequest) SetPrompt(v ResponsesRequestPrompt)`

SetPrompt sets Prompt field to given value.

### HasPrompt

`func (o *ResponsesRequest) HasPrompt() bool`

HasPrompt returns a boolean if a field has been set.

### GetPromptCacheKey

`func (o *ResponsesRequest) GetPromptCacheKey() string`

GetPromptCacheKey returns the PromptCacheKey field if non-nil, zero value otherwise.

### GetPromptCacheKeyOk

`func (o *ResponsesRequest) GetPromptCacheKeyOk() (*string, bool)`

GetPromptCacheKeyOk returns a tuple with the PromptCacheKey field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPromptCacheKey

`func (o *ResponsesRequest) SetPromptCacheKey(v string)`

SetPromptCacheKey sets PromptCacheKey field to given value.

### HasPromptCacheKey

`func (o *ResponsesRequest) HasPromptCacheKey() bool`

HasPromptCacheKey returns a boolean if a field has been set.

### GetPromptCacheRetention

`func (o *ResponsesRequest) GetPromptCacheRetention() string`

GetPromptCacheRetention returns the PromptCacheRetention field if non-nil, zero value otherwise.

### GetPromptCacheRetentionOk

`func (o *ResponsesRequest) GetPromptCacheRetentionOk() (*string, bool)`

GetPromptCacheRetentionOk returns a tuple with the PromptCacheRetention field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPromptCacheRetention

`func (o *ResponsesRequest) SetPromptCacheRetention(v string)`

SetPromptCacheRetention sets PromptCacheRetention field to given value.

### HasPromptCacheRetention

`func (o *ResponsesRequest) HasPromptCacheRetention() bool`

HasPromptCacheRetention returns a boolean if a field has been set.

### GetModalities

`func (o *ResponsesRequest) GetModalities() []string`

GetModalities returns the Modalities field if non-nil, zero value otherwise.

### GetModalitiesOk

`func (o *ResponsesRequest) GetModalitiesOk() (*[]string, bool)`

GetModalitiesOk returns a tuple with the Modalities field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModalities

`func (o *ResponsesRequest) SetModalities(v []string)`

SetModalities sets Modalities field to given value.

### HasModalities

`func (o *ResponsesRequest) HasModalities() bool`

HasModalities returns a boolean if a field has been set.

### GetReasoning

`func (o *ResponsesRequest) GetReasoning() ResponsesRequestReasoning`

GetReasoning returns the Reasoning field if non-nil, zero value otherwise.

### GetReasoningOk

`func (o *ResponsesRequest) GetReasoningOk() (*ResponsesRequestReasoning, bool)`

GetReasoningOk returns a tuple with the Reasoning field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReasoning

`func (o *ResponsesRequest) SetReasoning(v ResponsesRequestReasoning)`

SetReasoning sets Reasoning field to given value.

### HasReasoning

`func (o *ResponsesRequest) HasReasoning() bool`

HasReasoning returns a boolean if a field has been set.

### GetSafetyIdentifier

`func (o *ResponsesRequest) GetSafetyIdentifier() string`

GetSafetyIdentifier returns the SafetyIdentifier field if non-nil, zero value otherwise.

### GetSafetyIdentifierOk

`func (o *ResponsesRequest) GetSafetyIdentifierOk() (*string, bool)`

GetSafetyIdentifierOk returns a tuple with the SafetyIdentifier field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSafetyIdentifier

`func (o *ResponsesRequest) SetSafetyIdentifier(v string)`

SetSafetyIdentifier sets SafetyIdentifier field to given value.

### HasSafetyIdentifier

`func (o *ResponsesRequest) HasSafetyIdentifier() bool`

HasSafetyIdentifier returns a boolean if a field has been set.

### GetServiceTier

`func (o *ResponsesRequest) GetServiceTier() string`

GetServiceTier returns the ServiceTier field if non-nil, zero value otherwise.

### GetServiceTierOk

`func (o *ResponsesRequest) GetServiceTierOk() (*string, bool)`

GetServiceTierOk returns a tuple with the ServiceTier field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetServiceTier

`func (o *ResponsesRequest) SetServiceTier(v string)`

SetServiceTier sets ServiceTier field to given value.

### HasServiceTier

`func (o *ResponsesRequest) HasServiceTier() bool`

HasServiceTier returns a boolean if a field has been set.

### GetStore

`func (o *ResponsesRequest) GetStore() bool`

GetStore returns the Store field if non-nil, zero value otherwise.

### GetStoreOk

`func (o *ResponsesRequest) GetStoreOk() (*bool, bool)`

GetStoreOk returns a tuple with the Store field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStore

`func (o *ResponsesRequest) SetStore(v bool)`

SetStore sets Store field to given value.

### HasStore

`func (o *ResponsesRequest) HasStore() bool`

HasStore returns a boolean if a field has been set.

### GetStream

`func (o *ResponsesRequest) GetStream() bool`

GetStream returns the Stream field if non-nil, zero value otherwise.

### GetStreamOk

`func (o *ResponsesRequest) GetStreamOk() (*bool, bool)`

GetStreamOk returns a tuple with the Stream field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStream

`func (o *ResponsesRequest) SetStream(v bool)`

SetStream sets Stream field to given value.

### HasStream

`func (o *ResponsesRequest) HasStream() bool`

HasStream returns a boolean if a field has been set.

### GetStreamOptions

`func (o *ResponsesRequest) GetStreamOptions() map[string]interface{}`

GetStreamOptions returns the StreamOptions field if non-nil, zero value otherwise.

### GetStreamOptionsOk

`func (o *ResponsesRequest) GetStreamOptionsOk() (*map[string]interface{}, bool)`

GetStreamOptionsOk returns a tuple with the StreamOptions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStreamOptions

`func (o *ResponsesRequest) SetStreamOptions(v map[string]interface{})`

SetStreamOptions sets StreamOptions field to given value.

### HasStreamOptions

`func (o *ResponsesRequest) HasStreamOptions() bool`

HasStreamOptions returns a boolean if a field has been set.

### GetTemperature

`func (o *ResponsesRequest) GetTemperature() float32`

GetTemperature returns the Temperature field if non-nil, zero value otherwise.

### GetTemperatureOk

`func (o *ResponsesRequest) GetTemperatureOk() (*float32, bool)`

GetTemperatureOk returns a tuple with the Temperature field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTemperature

`func (o *ResponsesRequest) SetTemperature(v float32)`

SetTemperature sets Temperature field to given value.

### HasTemperature

`func (o *ResponsesRequest) HasTemperature() bool`

HasTemperature returns a boolean if a field has been set.

### GetText

`func (o *ResponsesRequest) GetText() map[string]interface{}`

GetText returns the Text field if non-nil, zero value otherwise.

### GetTextOk

`func (o *ResponsesRequest) GetTextOk() (*map[string]interface{}, bool)`

GetTextOk returns a tuple with the Text field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetText

`func (o *ResponsesRequest) SetText(v map[string]interface{})`

SetText sets Text field to given value.

### HasText

`func (o *ResponsesRequest) HasText() bool`

HasText returns a boolean if a field has been set.

### GetToolChoice

`func (o *ResponsesRequest) GetToolChoice() ChatCompletionsRequestToolChoice`

GetToolChoice returns the ToolChoice field if non-nil, zero value otherwise.

### GetToolChoiceOk

`func (o *ResponsesRequest) GetToolChoiceOk() (*ChatCompletionsRequestToolChoice, bool)`

GetToolChoiceOk returns a tuple with the ToolChoice field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolChoice

`func (o *ResponsesRequest) SetToolChoice(v ChatCompletionsRequestToolChoice)`

SetToolChoice sets ToolChoice field to given value.

### HasToolChoice

`func (o *ResponsesRequest) HasToolChoice() bool`

HasToolChoice returns a boolean if a field has been set.

### GetTools

`func (o *ResponsesRequest) GetTools() []map[string]interface{}`

GetTools returns the Tools field if non-nil, zero value otherwise.

### GetToolsOk

`func (o *ResponsesRequest) GetToolsOk() (*[]map[string]interface{}, bool)`

GetToolsOk returns a tuple with the Tools field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTools

`func (o *ResponsesRequest) SetTools(v []map[string]interface{})`

SetTools sets Tools field to given value.

### HasTools

`func (o *ResponsesRequest) HasTools() bool`

HasTools returns a boolean if a field has been set.

### GetTopLogprobs

`func (o *ResponsesRequest) GetTopLogprobs() int32`

GetTopLogprobs returns the TopLogprobs field if non-nil, zero value otherwise.

### GetTopLogprobsOk

`func (o *ResponsesRequest) GetTopLogprobsOk() (*int32, bool)`

GetTopLogprobsOk returns a tuple with the TopLogprobs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopLogprobs

`func (o *ResponsesRequest) SetTopLogprobs(v int32)`

SetTopLogprobs sets TopLogprobs field to given value.

### HasTopLogprobs

`func (o *ResponsesRequest) HasTopLogprobs() bool`

HasTopLogprobs returns a boolean if a field has been set.

### GetTopP

`func (o *ResponsesRequest) GetTopP() float32`

GetTopP returns the TopP field if non-nil, zero value otherwise.

### GetTopPOk

`func (o *ResponsesRequest) GetTopPOk() (*float32, bool)`

GetTopPOk returns a tuple with the TopP field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopP

`func (o *ResponsesRequest) SetTopP(v float32)`

SetTopP sets TopP field to given value.

### HasTopP

`func (o *ResponsesRequest) HasTopP() bool`

HasTopP returns a boolean if a field has been set.

### GetTruncation

`func (o *ResponsesRequest) GetTruncation() string`

GetTruncation returns the Truncation field if non-nil, zero value otherwise.

### GetTruncationOk

`func (o *ResponsesRequest) GetTruncationOk() (*string, bool)`

GetTruncationOk returns a tuple with the Truncation field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTruncation

`func (o *ResponsesRequest) SetTruncation(v string)`

SetTruncation sets Truncation field to given value.

### HasTruncation

`func (o *ResponsesRequest) HasTruncation() bool`

HasTruncation returns a boolean if a field has been set.

### GetBackground

`func (o *ResponsesRequest) GetBackground() bool`

GetBackground returns the Background field if non-nil, zero value otherwise.

### GetBackgroundOk

`func (o *ResponsesRequest) GetBackgroundOk() (*bool, bool)`

GetBackgroundOk returns a tuple with the Background field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetBackground

`func (o *ResponsesRequest) SetBackground(v bool)`

SetBackground sets Background field to given value.

### HasBackground

`func (o *ResponsesRequest) HasBackground() bool`

HasBackground returns a boolean if a field has been set.

### GetUser

`func (o *ResponsesRequest) GetUser() string`

GetUser returns the User field if non-nil, zero value otherwise.

### GetUserOk

`func (o *ResponsesRequest) GetUserOk() (*string, bool)`

GetUserOk returns a tuple with the User field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUser

`func (o *ResponsesRequest) SetUser(v string)`

SetUser sets User field to given value.

### HasUser

`func (o *ResponsesRequest) HasUser() bool`

HasUser returns a boolean if a field has been set.

### GetMeta

`func (o *ResponsesRequest) GetMeta() bool`

GetMeta returns the Meta field if non-nil, zero value otherwise.

### GetMetaOk

`func (o *ResponsesRequest) GetMetaOk() (*bool, bool)`

GetMetaOk returns a tuple with the Meta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMeta

`func (o *ResponsesRequest) SetMeta(v bool)`

SetMeta sets Meta field to given value.

### HasMeta

`func (o *ResponsesRequest) HasMeta() bool`

HasMeta returns a boolean if a field has been set.

### GetProvider

`func (o *ResponsesRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *ResponsesRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *ResponsesRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *ResponsesRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


