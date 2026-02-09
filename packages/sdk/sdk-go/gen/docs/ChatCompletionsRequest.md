# ChatCompletionsRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**System** | Pointer to **string** |  | [optional] 
**Messages** | [**[]ChatMessage**](ChatMessage.md) |  | 
**Reasoning** | Pointer to [**ReasoningConfig**](ReasoningConfig.md) |  | [optional] 
**FrequencyPenalty** | Pointer to **float32** |  | [optional] 
**LogitBias** | Pointer to **map[string]float32** |  | [optional] 
**MaxOutputTokens** | Pointer to **int32** |  | [optional] 
**Meta** | Pointer to **bool** |  | [optional] [default to false]
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**PresencePenalty** | Pointer to **float32** |  | [optional] 
**Seed** | Pointer to **int32** |  | [optional] 
**Stream** | Pointer to **bool** |  | [optional] [default to false]
**Temperature** | Pointer to **float32** |  | [optional] [default to 1]
**Tools** | Pointer to [**[]ChatCompletionsRequestToolsInner**](ChatCompletionsRequestToolsInner.md) |  | [optional] 
**MaxToolCalls** | Pointer to **int32** |  | [optional] 
**ParallelToolCalls** | Pointer to **bool** |  | [optional] [default to true]
**ToolChoice** | Pointer to [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**TopK** | Pointer to **int32** |  | [optional] 
**Logprobs** | Pointer to **bool** |  | [optional] [default to false]
**TopLogprobs** | Pointer to **int32** |  | [optional] 
**TopP** | Pointer to **float32** |  | [optional] 
**ResponseFormat** | Pointer to [**ChatCompletionsRequestResponseFormat**](ChatCompletionsRequestResponseFormat.md) |  | [optional] 
**Usage** | Pointer to **bool** |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 
**UserId** | Pointer to **string** |  | [optional] 
**ServiceTier** | Pointer to **string** |  | [optional] [default to "standard"]

## Methods

### NewChatCompletionsRequest

`func NewChatCompletionsRequest(model string, messages []ChatMessage, ) *ChatCompletionsRequest`

NewChatCompletionsRequest instantiates a new ChatCompletionsRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionsRequestWithDefaults

`func NewChatCompletionsRequestWithDefaults() *ChatCompletionsRequest`

NewChatCompletionsRequestWithDefaults instantiates a new ChatCompletionsRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *ChatCompletionsRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ChatCompletionsRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ChatCompletionsRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetSystem

`func (o *ChatCompletionsRequest) GetSystem() string`

GetSystem returns the System field if non-nil, zero value otherwise.

### GetSystemOk

`func (o *ChatCompletionsRequest) GetSystemOk() (*string, bool)`

GetSystemOk returns a tuple with the System field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSystem

`func (o *ChatCompletionsRequest) SetSystem(v string)`

SetSystem sets System field to given value.

### HasSystem

`func (o *ChatCompletionsRequest) HasSystem() bool`

HasSystem returns a boolean if a field has been set.

### GetMessages

`func (o *ChatCompletionsRequest) GetMessages() []ChatMessage`

GetMessages returns the Messages field if non-nil, zero value otherwise.

### GetMessagesOk

`func (o *ChatCompletionsRequest) GetMessagesOk() (*[]ChatMessage, bool)`

GetMessagesOk returns a tuple with the Messages field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMessages

`func (o *ChatCompletionsRequest) SetMessages(v []ChatMessage)`

SetMessages sets Messages field to given value.


### GetReasoning

`func (o *ChatCompletionsRequest) GetReasoning() ReasoningConfig`

GetReasoning returns the Reasoning field if non-nil, zero value otherwise.

### GetReasoningOk

`func (o *ChatCompletionsRequest) GetReasoningOk() (*ReasoningConfig, bool)`

GetReasoningOk returns a tuple with the Reasoning field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReasoning

`func (o *ChatCompletionsRequest) SetReasoning(v ReasoningConfig)`

SetReasoning sets Reasoning field to given value.

### HasReasoning

`func (o *ChatCompletionsRequest) HasReasoning() bool`

HasReasoning returns a boolean if a field has been set.

### GetFrequencyPenalty

`func (o *ChatCompletionsRequest) GetFrequencyPenalty() float32`

GetFrequencyPenalty returns the FrequencyPenalty field if non-nil, zero value otherwise.

### GetFrequencyPenaltyOk

`func (o *ChatCompletionsRequest) GetFrequencyPenaltyOk() (*float32, bool)`

GetFrequencyPenaltyOk returns a tuple with the FrequencyPenalty field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFrequencyPenalty

`func (o *ChatCompletionsRequest) SetFrequencyPenalty(v float32)`

SetFrequencyPenalty sets FrequencyPenalty field to given value.

### HasFrequencyPenalty

`func (o *ChatCompletionsRequest) HasFrequencyPenalty() bool`

HasFrequencyPenalty returns a boolean if a field has been set.

### GetLogitBias

`func (o *ChatCompletionsRequest) GetLogitBias() map[string]float32`

GetLogitBias returns the LogitBias field if non-nil, zero value otherwise.

### GetLogitBiasOk

`func (o *ChatCompletionsRequest) GetLogitBiasOk() (*map[string]float32, bool)`

GetLogitBiasOk returns a tuple with the LogitBias field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLogitBias

`func (o *ChatCompletionsRequest) SetLogitBias(v map[string]float32)`

SetLogitBias sets LogitBias field to given value.

### HasLogitBias

`func (o *ChatCompletionsRequest) HasLogitBias() bool`

HasLogitBias returns a boolean if a field has been set.

### GetMaxOutputTokens

`func (o *ChatCompletionsRequest) GetMaxOutputTokens() int32`

GetMaxOutputTokens returns the MaxOutputTokens field if non-nil, zero value otherwise.

### GetMaxOutputTokensOk

`func (o *ChatCompletionsRequest) GetMaxOutputTokensOk() (*int32, bool)`

GetMaxOutputTokensOk returns a tuple with the MaxOutputTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxOutputTokens

`func (o *ChatCompletionsRequest) SetMaxOutputTokens(v int32)`

SetMaxOutputTokens sets MaxOutputTokens field to given value.

### HasMaxOutputTokens

`func (o *ChatCompletionsRequest) HasMaxOutputTokens() bool`

HasMaxOutputTokens returns a boolean if a field has been set.

### GetMeta

`func (o *ChatCompletionsRequest) GetMeta() bool`

GetMeta returns the Meta field if non-nil, zero value otherwise.

### GetMetaOk

`func (o *ChatCompletionsRequest) GetMetaOk() (*bool, bool)`

GetMetaOk returns a tuple with the Meta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMeta

`func (o *ChatCompletionsRequest) SetMeta(v bool)`

SetMeta sets Meta field to given value.

### HasMeta

`func (o *ChatCompletionsRequest) HasMeta() bool`

HasMeta returns a boolean if a field has been set.

### GetDebug

`func (o *ChatCompletionsRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *ChatCompletionsRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *ChatCompletionsRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *ChatCompletionsRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetPresencePenalty

`func (o *ChatCompletionsRequest) GetPresencePenalty() float32`

GetPresencePenalty returns the PresencePenalty field if non-nil, zero value otherwise.

### GetPresencePenaltyOk

`func (o *ChatCompletionsRequest) GetPresencePenaltyOk() (*float32, bool)`

GetPresencePenaltyOk returns a tuple with the PresencePenalty field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPresencePenalty

`func (o *ChatCompletionsRequest) SetPresencePenalty(v float32)`

SetPresencePenalty sets PresencePenalty field to given value.

### HasPresencePenalty

`func (o *ChatCompletionsRequest) HasPresencePenalty() bool`

HasPresencePenalty returns a boolean if a field has been set.

### GetSeed

`func (o *ChatCompletionsRequest) GetSeed() int32`

GetSeed returns the Seed field if non-nil, zero value otherwise.

### GetSeedOk

`func (o *ChatCompletionsRequest) GetSeedOk() (*int32, bool)`

GetSeedOk returns a tuple with the Seed field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSeed

`func (o *ChatCompletionsRequest) SetSeed(v int32)`

SetSeed sets Seed field to given value.

### HasSeed

`func (o *ChatCompletionsRequest) HasSeed() bool`

HasSeed returns a boolean if a field has been set.

### GetStream

`func (o *ChatCompletionsRequest) GetStream() bool`

GetStream returns the Stream field if non-nil, zero value otherwise.

### GetStreamOk

`func (o *ChatCompletionsRequest) GetStreamOk() (*bool, bool)`

GetStreamOk returns a tuple with the Stream field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStream

`func (o *ChatCompletionsRequest) SetStream(v bool)`

SetStream sets Stream field to given value.

### HasStream

`func (o *ChatCompletionsRequest) HasStream() bool`

HasStream returns a boolean if a field has been set.

### GetTemperature

`func (o *ChatCompletionsRequest) GetTemperature() float32`

GetTemperature returns the Temperature field if non-nil, zero value otherwise.

### GetTemperatureOk

`func (o *ChatCompletionsRequest) GetTemperatureOk() (*float32, bool)`

GetTemperatureOk returns a tuple with the Temperature field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTemperature

`func (o *ChatCompletionsRequest) SetTemperature(v float32)`

SetTemperature sets Temperature field to given value.

### HasTemperature

`func (o *ChatCompletionsRequest) HasTemperature() bool`

HasTemperature returns a boolean if a field has been set.

### GetTools

`func (o *ChatCompletionsRequest) GetTools() []ChatCompletionsRequestToolsInner`

GetTools returns the Tools field if non-nil, zero value otherwise.

### GetToolsOk

`func (o *ChatCompletionsRequest) GetToolsOk() (*[]ChatCompletionsRequestToolsInner, bool)`

GetToolsOk returns a tuple with the Tools field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTools

`func (o *ChatCompletionsRequest) SetTools(v []ChatCompletionsRequestToolsInner)`

SetTools sets Tools field to given value.

### HasTools

`func (o *ChatCompletionsRequest) HasTools() bool`

HasTools returns a boolean if a field has been set.

### GetMaxToolCalls

`func (o *ChatCompletionsRequest) GetMaxToolCalls() int32`

GetMaxToolCalls returns the MaxToolCalls field if non-nil, zero value otherwise.

### GetMaxToolCallsOk

`func (o *ChatCompletionsRequest) GetMaxToolCallsOk() (*int32, bool)`

GetMaxToolCallsOk returns a tuple with the MaxToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxToolCalls

`func (o *ChatCompletionsRequest) SetMaxToolCalls(v int32)`

SetMaxToolCalls sets MaxToolCalls field to given value.

### HasMaxToolCalls

`func (o *ChatCompletionsRequest) HasMaxToolCalls() bool`

HasMaxToolCalls returns a boolean if a field has been set.

### GetParallelToolCalls

`func (o *ChatCompletionsRequest) GetParallelToolCalls() bool`

GetParallelToolCalls returns the ParallelToolCalls field if non-nil, zero value otherwise.

### GetParallelToolCallsOk

`func (o *ChatCompletionsRequest) GetParallelToolCallsOk() (*bool, bool)`

GetParallelToolCallsOk returns a tuple with the ParallelToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetParallelToolCalls

`func (o *ChatCompletionsRequest) SetParallelToolCalls(v bool)`

SetParallelToolCalls sets ParallelToolCalls field to given value.

### HasParallelToolCalls

`func (o *ChatCompletionsRequest) HasParallelToolCalls() bool`

HasParallelToolCalls returns a boolean if a field has been set.

### GetToolChoice

`func (o *ChatCompletionsRequest) GetToolChoice() ChatCompletionsRequestToolChoice`

GetToolChoice returns the ToolChoice field if non-nil, zero value otherwise.

### GetToolChoiceOk

`func (o *ChatCompletionsRequest) GetToolChoiceOk() (*ChatCompletionsRequestToolChoice, bool)`

GetToolChoiceOk returns a tuple with the ToolChoice field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolChoice

`func (o *ChatCompletionsRequest) SetToolChoice(v ChatCompletionsRequestToolChoice)`

SetToolChoice sets ToolChoice field to given value.

### HasToolChoice

`func (o *ChatCompletionsRequest) HasToolChoice() bool`

HasToolChoice returns a boolean if a field has been set.

### GetTopK

`func (o *ChatCompletionsRequest) GetTopK() int32`

GetTopK returns the TopK field if non-nil, zero value otherwise.

### GetTopKOk

`func (o *ChatCompletionsRequest) GetTopKOk() (*int32, bool)`

GetTopKOk returns a tuple with the TopK field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopK

`func (o *ChatCompletionsRequest) SetTopK(v int32)`

SetTopK sets TopK field to given value.

### HasTopK

`func (o *ChatCompletionsRequest) HasTopK() bool`

HasTopK returns a boolean if a field has been set.

### GetLogprobs

`func (o *ChatCompletionsRequest) GetLogprobs() bool`

GetLogprobs returns the Logprobs field if non-nil, zero value otherwise.

### GetLogprobsOk

`func (o *ChatCompletionsRequest) GetLogprobsOk() (*bool, bool)`

GetLogprobsOk returns a tuple with the Logprobs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLogprobs

`func (o *ChatCompletionsRequest) SetLogprobs(v bool)`

SetLogprobs sets Logprobs field to given value.

### HasLogprobs

`func (o *ChatCompletionsRequest) HasLogprobs() bool`

HasLogprobs returns a boolean if a field has been set.

### GetTopLogprobs

`func (o *ChatCompletionsRequest) GetTopLogprobs() int32`

GetTopLogprobs returns the TopLogprobs field if non-nil, zero value otherwise.

### GetTopLogprobsOk

`func (o *ChatCompletionsRequest) GetTopLogprobsOk() (*int32, bool)`

GetTopLogprobsOk returns a tuple with the TopLogprobs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopLogprobs

`func (o *ChatCompletionsRequest) SetTopLogprobs(v int32)`

SetTopLogprobs sets TopLogprobs field to given value.

### HasTopLogprobs

`func (o *ChatCompletionsRequest) HasTopLogprobs() bool`

HasTopLogprobs returns a boolean if a field has been set.

### GetTopP

`func (o *ChatCompletionsRequest) GetTopP() float32`

GetTopP returns the TopP field if non-nil, zero value otherwise.

### GetTopPOk

`func (o *ChatCompletionsRequest) GetTopPOk() (*float32, bool)`

GetTopPOk returns a tuple with the TopP field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopP

`func (o *ChatCompletionsRequest) SetTopP(v float32)`

SetTopP sets TopP field to given value.

### HasTopP

`func (o *ChatCompletionsRequest) HasTopP() bool`

HasTopP returns a boolean if a field has been set.

### GetResponseFormat

`func (o *ChatCompletionsRequest) GetResponseFormat() ChatCompletionsRequestResponseFormat`

GetResponseFormat returns the ResponseFormat field if non-nil, zero value otherwise.

### GetResponseFormatOk

`func (o *ChatCompletionsRequest) GetResponseFormatOk() (*ChatCompletionsRequestResponseFormat, bool)`

GetResponseFormatOk returns a tuple with the ResponseFormat field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetResponseFormat

`func (o *ChatCompletionsRequest) SetResponseFormat(v ChatCompletionsRequestResponseFormat)`

SetResponseFormat sets ResponseFormat field to given value.

### HasResponseFormat

`func (o *ChatCompletionsRequest) HasResponseFormat() bool`

HasResponseFormat returns a boolean if a field has been set.

### GetUsage

`func (o *ChatCompletionsRequest) GetUsage() bool`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *ChatCompletionsRequest) GetUsageOk() (*bool, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *ChatCompletionsRequest) SetUsage(v bool)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *ChatCompletionsRequest) HasUsage() bool`

HasUsage returns a boolean if a field has been set.

### GetProvider

`func (o *ChatCompletionsRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *ChatCompletionsRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *ChatCompletionsRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *ChatCompletionsRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.

### GetUserId

`func (o *ChatCompletionsRequest) GetUserId() string`

GetUserId returns the UserId field if non-nil, zero value otherwise.

### GetUserIdOk

`func (o *ChatCompletionsRequest) GetUserIdOk() (*string, bool)`

GetUserIdOk returns a tuple with the UserId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUserId

`func (o *ChatCompletionsRequest) SetUserId(v string)`

SetUserId sets UserId field to given value.

### HasUserId

`func (o *ChatCompletionsRequest) HasUserId() bool`

HasUserId returns a boolean if a field has been set.

### GetServiceTier

`func (o *ChatCompletionsRequest) GetServiceTier() string`

GetServiceTier returns the ServiceTier field if non-nil, zero value otherwise.

### GetServiceTierOk

`func (o *ChatCompletionsRequest) GetServiceTierOk() (*string, bool)`

GetServiceTierOk returns a tuple with the ServiceTier field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetServiceTier

`func (o *ChatCompletionsRequest) SetServiceTier(v string)`

SetServiceTier sets ServiceTier field to given value.

### HasServiceTier

`func (o *ChatCompletionsRequest) HasServiceTier() bool`

HasServiceTier returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


