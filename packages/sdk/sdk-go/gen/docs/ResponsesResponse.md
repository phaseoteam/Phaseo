# ResponsesResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**Object** | Pointer to **string** |  | [optional] 
**CreatedAt** | Pointer to **int32** |  | [optional] 
**Status** | Pointer to **string** |  | [optional] 
**CompletedAt** | Pointer to **NullableInt32** |  | [optional] 
**Error** | Pointer to **map[string]interface{}** |  | [optional] 
**IncompleteDetails** | Pointer to **map[string]interface{}** |  | [optional] 
**Instructions** | Pointer to **NullableString** |  | [optional] 
**MaxOutputTokens** | Pointer to **NullableInt32** |  | [optional] 
**MaxToolCalls** | Pointer to **NullableInt32** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Output** | Pointer to [**[]ResponsesOutputItem**](ResponsesOutputItem.md) |  | [optional] 
**ParallelToolCalls** | Pointer to **bool** |  | [optional] 
**PreviousResponseId** | Pointer to **NullableString** |  | [optional] 
**Reasoning** | Pointer to [**ResponsesResponseReasoning**](ResponsesResponseReasoning.md) |  | [optional] 
**FrequencyPenalty** | Pointer to **NullableFloat32** |  | [optional] 
**PresencePenalty** | Pointer to **NullableFloat32** |  | [optional] 
**Store** | Pointer to **NullableBool** |  | [optional] 
**Temperature** | Pointer to **NullableFloat32** |  | [optional] 
**Text** | Pointer to **map[string]interface{}** |  | [optional] 
**ToolChoice** | Pointer to [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Tools** | Pointer to **[]map[string]interface{}** |  | [optional] 
**TopLogprobs** | Pointer to **NullableInt32** |  | [optional] 
**TopP** | Pointer to **NullableFloat32** |  | [optional] 
**Truncation** | Pointer to **string** |  | [optional] 
**User** | Pointer to **NullableString** |  | [optional] 
**Background** | Pointer to **NullableBool** |  | [optional] 
**ServiceTier** | Pointer to **NullableString** |  | [optional] 
**SafetyIdentifier** | Pointer to **NullableString** |  | [optional] 
**PromptCacheKey** | Pointer to **NullableString** |  | [optional] 
**Metadata** | Pointer to **map[string]interface{}** |  | [optional] 
**NativeResponseId** | Pointer to **string** |  | [optional] 
**Meta** | Pointer to **map[string]interface{}** |  | [optional] 
**Debug** | Pointer to [**DebugResponse**](DebugResponse.md) |  | [optional] 
**UpstreamRequest** | Pointer to [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] 
**UpstreamResponse** | Pointer to [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] 
**Usage** | Pointer to [**Usage**](Usage.md) |  | [optional] 

## Methods

### NewResponsesResponse

`func NewResponsesResponse() *ResponsesResponse`

NewResponsesResponse instantiates a new ResponsesResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesResponseWithDefaults

`func NewResponsesResponseWithDefaults() *ResponsesResponse`

NewResponsesResponseWithDefaults instantiates a new ResponsesResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *ResponsesResponse) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *ResponsesResponse) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *ResponsesResponse) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *ResponsesResponse) HasId() bool`

HasId returns a boolean if a field has been set.

### GetObject

`func (o *ResponsesResponse) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *ResponsesResponse) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *ResponsesResponse) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *ResponsesResponse) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetCreatedAt

`func (o *ResponsesResponse) GetCreatedAt() int32`

GetCreatedAt returns the CreatedAt field if non-nil, zero value otherwise.

### GetCreatedAtOk

`func (o *ResponsesResponse) GetCreatedAtOk() (*int32, bool)`

GetCreatedAtOk returns a tuple with the CreatedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreatedAt

`func (o *ResponsesResponse) SetCreatedAt(v int32)`

SetCreatedAt sets CreatedAt field to given value.

### HasCreatedAt

`func (o *ResponsesResponse) HasCreatedAt() bool`

HasCreatedAt returns a boolean if a field has been set.

### GetStatus

`func (o *ResponsesResponse) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *ResponsesResponse) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *ResponsesResponse) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *ResponsesResponse) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetCompletedAt

`func (o *ResponsesResponse) GetCompletedAt() int32`

GetCompletedAt returns the CompletedAt field if non-nil, zero value otherwise.

### GetCompletedAtOk

`func (o *ResponsesResponse) GetCompletedAtOk() (*int32, bool)`

GetCompletedAtOk returns a tuple with the CompletedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompletedAt

`func (o *ResponsesResponse) SetCompletedAt(v int32)`

SetCompletedAt sets CompletedAt field to given value.

### HasCompletedAt

`func (o *ResponsesResponse) HasCompletedAt() bool`

HasCompletedAt returns a boolean if a field has been set.

### SetCompletedAtNil

`func (o *ResponsesResponse) SetCompletedAtNil(b bool)`

 SetCompletedAtNil sets the value for CompletedAt to be an explicit nil

### UnsetCompletedAt
`func (o *ResponsesResponse) UnsetCompletedAt()`

UnsetCompletedAt ensures that no value is present for CompletedAt, not even an explicit nil
### GetError

`func (o *ResponsesResponse) GetError() map[string]interface{}`

GetError returns the Error field if non-nil, zero value otherwise.

### GetErrorOk

`func (o *ResponsesResponse) GetErrorOk() (*map[string]interface{}, bool)`

GetErrorOk returns a tuple with the Error field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetError

`func (o *ResponsesResponse) SetError(v map[string]interface{})`

SetError sets Error field to given value.

### HasError

`func (o *ResponsesResponse) HasError() bool`

HasError returns a boolean if a field has been set.

### SetErrorNil

`func (o *ResponsesResponse) SetErrorNil(b bool)`

 SetErrorNil sets the value for Error to be an explicit nil

### UnsetError
`func (o *ResponsesResponse) UnsetError()`

UnsetError ensures that no value is present for Error, not even an explicit nil
### GetIncompleteDetails

`func (o *ResponsesResponse) GetIncompleteDetails() map[string]interface{}`

GetIncompleteDetails returns the IncompleteDetails field if non-nil, zero value otherwise.

### GetIncompleteDetailsOk

`func (o *ResponsesResponse) GetIncompleteDetailsOk() (*map[string]interface{}, bool)`

GetIncompleteDetailsOk returns a tuple with the IncompleteDetails field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIncompleteDetails

`func (o *ResponsesResponse) SetIncompleteDetails(v map[string]interface{})`

SetIncompleteDetails sets IncompleteDetails field to given value.

### HasIncompleteDetails

`func (o *ResponsesResponse) HasIncompleteDetails() bool`

HasIncompleteDetails returns a boolean if a field has been set.

### SetIncompleteDetailsNil

`func (o *ResponsesResponse) SetIncompleteDetailsNil(b bool)`

 SetIncompleteDetailsNil sets the value for IncompleteDetails to be an explicit nil

### UnsetIncompleteDetails
`func (o *ResponsesResponse) UnsetIncompleteDetails()`

UnsetIncompleteDetails ensures that no value is present for IncompleteDetails, not even an explicit nil
### GetInstructions

`func (o *ResponsesResponse) GetInstructions() string`

GetInstructions returns the Instructions field if non-nil, zero value otherwise.

### GetInstructionsOk

`func (o *ResponsesResponse) GetInstructionsOk() (*string, bool)`

GetInstructionsOk returns a tuple with the Instructions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInstructions

`func (o *ResponsesResponse) SetInstructions(v string)`

SetInstructions sets Instructions field to given value.

### HasInstructions

`func (o *ResponsesResponse) HasInstructions() bool`

HasInstructions returns a boolean if a field has been set.

### SetInstructionsNil

`func (o *ResponsesResponse) SetInstructionsNil(b bool)`

 SetInstructionsNil sets the value for Instructions to be an explicit nil

### UnsetInstructions
`func (o *ResponsesResponse) UnsetInstructions()`

UnsetInstructions ensures that no value is present for Instructions, not even an explicit nil
### GetMaxOutputTokens

`func (o *ResponsesResponse) GetMaxOutputTokens() int32`

GetMaxOutputTokens returns the MaxOutputTokens field if non-nil, zero value otherwise.

### GetMaxOutputTokensOk

`func (o *ResponsesResponse) GetMaxOutputTokensOk() (*int32, bool)`

GetMaxOutputTokensOk returns a tuple with the MaxOutputTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxOutputTokens

`func (o *ResponsesResponse) SetMaxOutputTokens(v int32)`

SetMaxOutputTokens sets MaxOutputTokens field to given value.

### HasMaxOutputTokens

`func (o *ResponsesResponse) HasMaxOutputTokens() bool`

HasMaxOutputTokens returns a boolean if a field has been set.

### SetMaxOutputTokensNil

`func (o *ResponsesResponse) SetMaxOutputTokensNil(b bool)`

 SetMaxOutputTokensNil sets the value for MaxOutputTokens to be an explicit nil

### UnsetMaxOutputTokens
`func (o *ResponsesResponse) UnsetMaxOutputTokens()`

UnsetMaxOutputTokens ensures that no value is present for MaxOutputTokens, not even an explicit nil
### GetMaxToolCalls

`func (o *ResponsesResponse) GetMaxToolCalls() int32`

GetMaxToolCalls returns the MaxToolCalls field if non-nil, zero value otherwise.

### GetMaxToolCallsOk

`func (o *ResponsesResponse) GetMaxToolCallsOk() (*int32, bool)`

GetMaxToolCallsOk returns a tuple with the MaxToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxToolCalls

`func (o *ResponsesResponse) SetMaxToolCalls(v int32)`

SetMaxToolCalls sets MaxToolCalls field to given value.

### HasMaxToolCalls

`func (o *ResponsesResponse) HasMaxToolCalls() bool`

HasMaxToolCalls returns a boolean if a field has been set.

### SetMaxToolCallsNil

`func (o *ResponsesResponse) SetMaxToolCallsNil(b bool)`

 SetMaxToolCallsNil sets the value for MaxToolCalls to be an explicit nil

### UnsetMaxToolCalls
`func (o *ResponsesResponse) UnsetMaxToolCalls()`

UnsetMaxToolCalls ensures that no value is present for MaxToolCalls, not even an explicit nil
### GetModel

`func (o *ResponsesResponse) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ResponsesResponse) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ResponsesResponse) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *ResponsesResponse) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetOutput

`func (o *ResponsesResponse) GetOutput() []ResponsesOutputItem`

GetOutput returns the Output field if non-nil, zero value otherwise.

### GetOutputOk

`func (o *ResponsesResponse) GetOutputOk() (*[]ResponsesOutputItem, bool)`

GetOutputOk returns a tuple with the Output field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutput

`func (o *ResponsesResponse) SetOutput(v []ResponsesOutputItem)`

SetOutput sets Output field to given value.

### HasOutput

`func (o *ResponsesResponse) HasOutput() bool`

HasOutput returns a boolean if a field has been set.

### GetParallelToolCalls

`func (o *ResponsesResponse) GetParallelToolCalls() bool`

GetParallelToolCalls returns the ParallelToolCalls field if non-nil, zero value otherwise.

### GetParallelToolCallsOk

`func (o *ResponsesResponse) GetParallelToolCallsOk() (*bool, bool)`

GetParallelToolCallsOk returns a tuple with the ParallelToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetParallelToolCalls

`func (o *ResponsesResponse) SetParallelToolCalls(v bool)`

SetParallelToolCalls sets ParallelToolCalls field to given value.

### HasParallelToolCalls

`func (o *ResponsesResponse) HasParallelToolCalls() bool`

HasParallelToolCalls returns a boolean if a field has been set.

### GetPreviousResponseId

`func (o *ResponsesResponse) GetPreviousResponseId() string`

GetPreviousResponseId returns the PreviousResponseId field if non-nil, zero value otherwise.

### GetPreviousResponseIdOk

`func (o *ResponsesResponse) GetPreviousResponseIdOk() (*string, bool)`

GetPreviousResponseIdOk returns a tuple with the PreviousResponseId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPreviousResponseId

`func (o *ResponsesResponse) SetPreviousResponseId(v string)`

SetPreviousResponseId sets PreviousResponseId field to given value.

### HasPreviousResponseId

`func (o *ResponsesResponse) HasPreviousResponseId() bool`

HasPreviousResponseId returns a boolean if a field has been set.

### SetPreviousResponseIdNil

`func (o *ResponsesResponse) SetPreviousResponseIdNil(b bool)`

 SetPreviousResponseIdNil sets the value for PreviousResponseId to be an explicit nil

### UnsetPreviousResponseId
`func (o *ResponsesResponse) UnsetPreviousResponseId()`

UnsetPreviousResponseId ensures that no value is present for PreviousResponseId, not even an explicit nil
### GetReasoning

`func (o *ResponsesResponse) GetReasoning() ResponsesResponseReasoning`

GetReasoning returns the Reasoning field if non-nil, zero value otherwise.

### GetReasoningOk

`func (o *ResponsesResponse) GetReasoningOk() (*ResponsesResponseReasoning, bool)`

GetReasoningOk returns a tuple with the Reasoning field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReasoning

`func (o *ResponsesResponse) SetReasoning(v ResponsesResponseReasoning)`

SetReasoning sets Reasoning field to given value.

### HasReasoning

`func (o *ResponsesResponse) HasReasoning() bool`

HasReasoning returns a boolean if a field has been set.

### GetFrequencyPenalty

`func (o *ResponsesResponse) GetFrequencyPenalty() float32`

GetFrequencyPenalty returns the FrequencyPenalty field if non-nil, zero value otherwise.

### GetFrequencyPenaltyOk

`func (o *ResponsesResponse) GetFrequencyPenaltyOk() (*float32, bool)`

GetFrequencyPenaltyOk returns a tuple with the FrequencyPenalty field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFrequencyPenalty

`func (o *ResponsesResponse) SetFrequencyPenalty(v float32)`

SetFrequencyPenalty sets FrequencyPenalty field to given value.

### HasFrequencyPenalty

`func (o *ResponsesResponse) HasFrequencyPenalty() bool`

HasFrequencyPenalty returns a boolean if a field has been set.

### SetFrequencyPenaltyNil

`func (o *ResponsesResponse) SetFrequencyPenaltyNil(b bool)`

 SetFrequencyPenaltyNil sets the value for FrequencyPenalty to be an explicit nil

### UnsetFrequencyPenalty
`func (o *ResponsesResponse) UnsetFrequencyPenalty()`

UnsetFrequencyPenalty ensures that no value is present for FrequencyPenalty, not even an explicit nil
### GetPresencePenalty

`func (o *ResponsesResponse) GetPresencePenalty() float32`

GetPresencePenalty returns the PresencePenalty field if non-nil, zero value otherwise.

### GetPresencePenaltyOk

`func (o *ResponsesResponse) GetPresencePenaltyOk() (*float32, bool)`

GetPresencePenaltyOk returns a tuple with the PresencePenalty field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPresencePenalty

`func (o *ResponsesResponse) SetPresencePenalty(v float32)`

SetPresencePenalty sets PresencePenalty field to given value.

### HasPresencePenalty

`func (o *ResponsesResponse) HasPresencePenalty() bool`

HasPresencePenalty returns a boolean if a field has been set.

### SetPresencePenaltyNil

`func (o *ResponsesResponse) SetPresencePenaltyNil(b bool)`

 SetPresencePenaltyNil sets the value for PresencePenalty to be an explicit nil

### UnsetPresencePenalty
`func (o *ResponsesResponse) UnsetPresencePenalty()`

UnsetPresencePenalty ensures that no value is present for PresencePenalty, not even an explicit nil
### GetStore

`func (o *ResponsesResponse) GetStore() bool`

GetStore returns the Store field if non-nil, zero value otherwise.

### GetStoreOk

`func (o *ResponsesResponse) GetStoreOk() (*bool, bool)`

GetStoreOk returns a tuple with the Store field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStore

`func (o *ResponsesResponse) SetStore(v bool)`

SetStore sets Store field to given value.

### HasStore

`func (o *ResponsesResponse) HasStore() bool`

HasStore returns a boolean if a field has been set.

### SetStoreNil

`func (o *ResponsesResponse) SetStoreNil(b bool)`

 SetStoreNil sets the value for Store to be an explicit nil

### UnsetStore
`func (o *ResponsesResponse) UnsetStore()`

UnsetStore ensures that no value is present for Store, not even an explicit nil
### GetTemperature

`func (o *ResponsesResponse) GetTemperature() float32`

GetTemperature returns the Temperature field if non-nil, zero value otherwise.

### GetTemperatureOk

`func (o *ResponsesResponse) GetTemperatureOk() (*float32, bool)`

GetTemperatureOk returns a tuple with the Temperature field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTemperature

`func (o *ResponsesResponse) SetTemperature(v float32)`

SetTemperature sets Temperature field to given value.

### HasTemperature

`func (o *ResponsesResponse) HasTemperature() bool`

HasTemperature returns a boolean if a field has been set.

### SetTemperatureNil

`func (o *ResponsesResponse) SetTemperatureNil(b bool)`

 SetTemperatureNil sets the value for Temperature to be an explicit nil

### UnsetTemperature
`func (o *ResponsesResponse) UnsetTemperature()`

UnsetTemperature ensures that no value is present for Temperature, not even an explicit nil
### GetText

`func (o *ResponsesResponse) GetText() map[string]interface{}`

GetText returns the Text field if non-nil, zero value otherwise.

### GetTextOk

`func (o *ResponsesResponse) GetTextOk() (*map[string]interface{}, bool)`

GetTextOk returns a tuple with the Text field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetText

`func (o *ResponsesResponse) SetText(v map[string]interface{})`

SetText sets Text field to given value.

### HasText

`func (o *ResponsesResponse) HasText() bool`

HasText returns a boolean if a field has been set.

### SetTextNil

`func (o *ResponsesResponse) SetTextNil(b bool)`

 SetTextNil sets the value for Text to be an explicit nil

### UnsetText
`func (o *ResponsesResponse) UnsetText()`

UnsetText ensures that no value is present for Text, not even an explicit nil
### GetToolChoice

`func (o *ResponsesResponse) GetToolChoice() ChatCompletionsRequestToolChoice`

GetToolChoice returns the ToolChoice field if non-nil, zero value otherwise.

### GetToolChoiceOk

`func (o *ResponsesResponse) GetToolChoiceOk() (*ChatCompletionsRequestToolChoice, bool)`

GetToolChoiceOk returns a tuple with the ToolChoice field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolChoice

`func (o *ResponsesResponse) SetToolChoice(v ChatCompletionsRequestToolChoice)`

SetToolChoice sets ToolChoice field to given value.

### HasToolChoice

`func (o *ResponsesResponse) HasToolChoice() bool`

HasToolChoice returns a boolean if a field has been set.

### GetTools

`func (o *ResponsesResponse) GetTools() []map[string]interface{}`

GetTools returns the Tools field if non-nil, zero value otherwise.

### GetToolsOk

`func (o *ResponsesResponse) GetToolsOk() (*[]map[string]interface{}, bool)`

GetToolsOk returns a tuple with the Tools field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTools

`func (o *ResponsesResponse) SetTools(v []map[string]interface{})`

SetTools sets Tools field to given value.

### HasTools

`func (o *ResponsesResponse) HasTools() bool`

HasTools returns a boolean if a field has been set.

### GetTopLogprobs

`func (o *ResponsesResponse) GetTopLogprobs() int32`

GetTopLogprobs returns the TopLogprobs field if non-nil, zero value otherwise.

### GetTopLogprobsOk

`func (o *ResponsesResponse) GetTopLogprobsOk() (*int32, bool)`

GetTopLogprobsOk returns a tuple with the TopLogprobs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopLogprobs

`func (o *ResponsesResponse) SetTopLogprobs(v int32)`

SetTopLogprobs sets TopLogprobs field to given value.

### HasTopLogprobs

`func (o *ResponsesResponse) HasTopLogprobs() bool`

HasTopLogprobs returns a boolean if a field has been set.

### SetTopLogprobsNil

`func (o *ResponsesResponse) SetTopLogprobsNil(b bool)`

 SetTopLogprobsNil sets the value for TopLogprobs to be an explicit nil

### UnsetTopLogprobs
`func (o *ResponsesResponse) UnsetTopLogprobs()`

UnsetTopLogprobs ensures that no value is present for TopLogprobs, not even an explicit nil
### GetTopP

`func (o *ResponsesResponse) GetTopP() float32`

GetTopP returns the TopP field if non-nil, zero value otherwise.

### GetTopPOk

`func (o *ResponsesResponse) GetTopPOk() (*float32, bool)`

GetTopPOk returns a tuple with the TopP field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopP

`func (o *ResponsesResponse) SetTopP(v float32)`

SetTopP sets TopP field to given value.

### HasTopP

`func (o *ResponsesResponse) HasTopP() bool`

HasTopP returns a boolean if a field has been set.

### SetTopPNil

`func (o *ResponsesResponse) SetTopPNil(b bool)`

 SetTopPNil sets the value for TopP to be an explicit nil

### UnsetTopP
`func (o *ResponsesResponse) UnsetTopP()`

UnsetTopP ensures that no value is present for TopP, not even an explicit nil
### GetTruncation

`func (o *ResponsesResponse) GetTruncation() string`

GetTruncation returns the Truncation field if non-nil, zero value otherwise.

### GetTruncationOk

`func (o *ResponsesResponse) GetTruncationOk() (*string, bool)`

GetTruncationOk returns a tuple with the Truncation field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTruncation

`func (o *ResponsesResponse) SetTruncation(v string)`

SetTruncation sets Truncation field to given value.

### HasTruncation

`func (o *ResponsesResponse) HasTruncation() bool`

HasTruncation returns a boolean if a field has been set.

### GetUser

`func (o *ResponsesResponse) GetUser() string`

GetUser returns the User field if non-nil, zero value otherwise.

### GetUserOk

`func (o *ResponsesResponse) GetUserOk() (*string, bool)`

GetUserOk returns a tuple with the User field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUser

`func (o *ResponsesResponse) SetUser(v string)`

SetUser sets User field to given value.

### HasUser

`func (o *ResponsesResponse) HasUser() bool`

HasUser returns a boolean if a field has been set.

### SetUserNil

`func (o *ResponsesResponse) SetUserNil(b bool)`

 SetUserNil sets the value for User to be an explicit nil

### UnsetUser
`func (o *ResponsesResponse) UnsetUser()`

UnsetUser ensures that no value is present for User, not even an explicit nil
### GetBackground

`func (o *ResponsesResponse) GetBackground() bool`

GetBackground returns the Background field if non-nil, zero value otherwise.

### GetBackgroundOk

`func (o *ResponsesResponse) GetBackgroundOk() (*bool, bool)`

GetBackgroundOk returns a tuple with the Background field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetBackground

`func (o *ResponsesResponse) SetBackground(v bool)`

SetBackground sets Background field to given value.

### HasBackground

`func (o *ResponsesResponse) HasBackground() bool`

HasBackground returns a boolean if a field has been set.

### SetBackgroundNil

`func (o *ResponsesResponse) SetBackgroundNil(b bool)`

 SetBackgroundNil sets the value for Background to be an explicit nil

### UnsetBackground
`func (o *ResponsesResponse) UnsetBackground()`

UnsetBackground ensures that no value is present for Background, not even an explicit nil
### GetServiceTier

`func (o *ResponsesResponse) GetServiceTier() string`

GetServiceTier returns the ServiceTier field if non-nil, zero value otherwise.

### GetServiceTierOk

`func (o *ResponsesResponse) GetServiceTierOk() (*string, bool)`

GetServiceTierOk returns a tuple with the ServiceTier field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetServiceTier

`func (o *ResponsesResponse) SetServiceTier(v string)`

SetServiceTier sets ServiceTier field to given value.

### HasServiceTier

`func (o *ResponsesResponse) HasServiceTier() bool`

HasServiceTier returns a boolean if a field has been set.

### SetServiceTierNil

`func (o *ResponsesResponse) SetServiceTierNil(b bool)`

 SetServiceTierNil sets the value for ServiceTier to be an explicit nil

### UnsetServiceTier
`func (o *ResponsesResponse) UnsetServiceTier()`

UnsetServiceTier ensures that no value is present for ServiceTier, not even an explicit nil
### GetSafetyIdentifier

`func (o *ResponsesResponse) GetSafetyIdentifier() string`

GetSafetyIdentifier returns the SafetyIdentifier field if non-nil, zero value otherwise.

### GetSafetyIdentifierOk

`func (o *ResponsesResponse) GetSafetyIdentifierOk() (*string, bool)`

GetSafetyIdentifierOk returns a tuple with the SafetyIdentifier field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSafetyIdentifier

`func (o *ResponsesResponse) SetSafetyIdentifier(v string)`

SetSafetyIdentifier sets SafetyIdentifier field to given value.

### HasSafetyIdentifier

`func (o *ResponsesResponse) HasSafetyIdentifier() bool`

HasSafetyIdentifier returns a boolean if a field has been set.

### SetSafetyIdentifierNil

`func (o *ResponsesResponse) SetSafetyIdentifierNil(b bool)`

 SetSafetyIdentifierNil sets the value for SafetyIdentifier to be an explicit nil

### UnsetSafetyIdentifier
`func (o *ResponsesResponse) UnsetSafetyIdentifier()`

UnsetSafetyIdentifier ensures that no value is present for SafetyIdentifier, not even an explicit nil
### GetPromptCacheKey

`func (o *ResponsesResponse) GetPromptCacheKey() string`

GetPromptCacheKey returns the PromptCacheKey field if non-nil, zero value otherwise.

### GetPromptCacheKeyOk

`func (o *ResponsesResponse) GetPromptCacheKeyOk() (*string, bool)`

GetPromptCacheKeyOk returns a tuple with the PromptCacheKey field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPromptCacheKey

`func (o *ResponsesResponse) SetPromptCacheKey(v string)`

SetPromptCacheKey sets PromptCacheKey field to given value.

### HasPromptCacheKey

`func (o *ResponsesResponse) HasPromptCacheKey() bool`

HasPromptCacheKey returns a boolean if a field has been set.

### SetPromptCacheKeyNil

`func (o *ResponsesResponse) SetPromptCacheKeyNil(b bool)`

 SetPromptCacheKeyNil sets the value for PromptCacheKey to be an explicit nil

### UnsetPromptCacheKey
`func (o *ResponsesResponse) UnsetPromptCacheKey()`

UnsetPromptCacheKey ensures that no value is present for PromptCacheKey, not even an explicit nil
### GetMetadata

`func (o *ResponsesResponse) GetMetadata() map[string]interface{}`

GetMetadata returns the Metadata field if non-nil, zero value otherwise.

### GetMetadataOk

`func (o *ResponsesResponse) GetMetadataOk() (*map[string]interface{}, bool)`

GetMetadataOk returns a tuple with the Metadata field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMetadata

`func (o *ResponsesResponse) SetMetadata(v map[string]interface{})`

SetMetadata sets Metadata field to given value.

### HasMetadata

`func (o *ResponsesResponse) HasMetadata() bool`

HasMetadata returns a boolean if a field has been set.

### GetNativeResponseId

`func (o *ResponsesResponse) GetNativeResponseId() string`

GetNativeResponseId returns the NativeResponseId field if non-nil, zero value otherwise.

### GetNativeResponseIdOk

`func (o *ResponsesResponse) GetNativeResponseIdOk() (*string, bool)`

GetNativeResponseIdOk returns a tuple with the NativeResponseId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetNativeResponseId

`func (o *ResponsesResponse) SetNativeResponseId(v string)`

SetNativeResponseId sets NativeResponseId field to given value.

### HasNativeResponseId

`func (o *ResponsesResponse) HasNativeResponseId() bool`

HasNativeResponseId returns a boolean if a field has been set.

### GetMeta

`func (o *ResponsesResponse) GetMeta() map[string]interface{}`

GetMeta returns the Meta field if non-nil, zero value otherwise.

### GetMetaOk

`func (o *ResponsesResponse) GetMetaOk() (*map[string]interface{}, bool)`

GetMetaOk returns a tuple with the Meta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMeta

`func (o *ResponsesResponse) SetMeta(v map[string]interface{})`

SetMeta sets Meta field to given value.

### HasMeta

`func (o *ResponsesResponse) HasMeta() bool`

HasMeta returns a boolean if a field has been set.

### GetDebug

`func (o *ResponsesResponse) GetDebug() DebugResponse`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *ResponsesResponse) GetDebugOk() (*DebugResponse, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *ResponsesResponse) SetDebug(v DebugResponse)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *ResponsesResponse) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetUpstreamRequest

`func (o *ResponsesResponse) GetUpstreamRequest() ChatCompletionsResponseUpstreamRequest`

GetUpstreamRequest returns the UpstreamRequest field if non-nil, zero value otherwise.

### GetUpstreamRequestOk

`func (o *ResponsesResponse) GetUpstreamRequestOk() (*ChatCompletionsResponseUpstreamRequest, bool)`

GetUpstreamRequestOk returns a tuple with the UpstreamRequest field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUpstreamRequest

`func (o *ResponsesResponse) SetUpstreamRequest(v ChatCompletionsResponseUpstreamRequest)`

SetUpstreamRequest sets UpstreamRequest field to given value.

### HasUpstreamRequest

`func (o *ResponsesResponse) HasUpstreamRequest() bool`

HasUpstreamRequest returns a boolean if a field has been set.

### GetUpstreamResponse

`func (o *ResponsesResponse) GetUpstreamResponse() ChatCompletionsResponseUpstreamRequest`

GetUpstreamResponse returns the UpstreamResponse field if non-nil, zero value otherwise.

### GetUpstreamResponseOk

`func (o *ResponsesResponse) GetUpstreamResponseOk() (*ChatCompletionsResponseUpstreamRequest, bool)`

GetUpstreamResponseOk returns a tuple with the UpstreamResponse field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUpstreamResponse

`func (o *ResponsesResponse) SetUpstreamResponse(v ChatCompletionsResponseUpstreamRequest)`

SetUpstreamResponse sets UpstreamResponse field to given value.

### HasUpstreamResponse

`func (o *ResponsesResponse) HasUpstreamResponse() bool`

HasUpstreamResponse returns a boolean if a field has been set.

### GetUsage

`func (o *ResponsesResponse) GetUsage() Usage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *ResponsesResponse) GetUsageOk() (*Usage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *ResponsesResponse) SetUsage(v Usage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *ResponsesResponse) HasUsage() bool`

HasUsage returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


