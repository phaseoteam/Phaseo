# AnthropicMessagesRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**System** | Pointer to [**AnthropicMessagesRequestSystem**](AnthropicMessagesRequestSystem.md) |  | [optional] 
**Messages** | [**[]AnthropicMessage**](AnthropicMessage.md) |  | 
**MaxTokens** | **int32** |  | 
**Temperature** | Pointer to **float32** |  | [optional] 
**TopP** | Pointer to **float32** |  | [optional] 
**TopK** | Pointer to **int32** |  | [optional] 
**Tools** | Pointer to [**[]AnthropicTool**](AnthropicTool.md) |  | [optional] 
**ToolChoice** | Pointer to [**ChatCompletionsRequestToolChoice**](ChatCompletionsRequestToolChoice.md) |  | [optional] 
**Stream** | Pointer to **bool** |  | [optional] 
**StopSequences** | Pointer to **[]string** |  | [optional] 
**Modalities** | Pointer to **[]string** |  | [optional] 
**Metadata** | Pointer to **map[string]string** |  | [optional] 
**Meta** | Pointer to **bool** |  | [optional] 
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewAnthropicMessagesRequest

`func NewAnthropicMessagesRequest(model string, messages []AnthropicMessage, maxTokens int32, ) *AnthropicMessagesRequest`

NewAnthropicMessagesRequest instantiates a new AnthropicMessagesRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicMessagesRequestWithDefaults

`func NewAnthropicMessagesRequestWithDefaults() *AnthropicMessagesRequest`

NewAnthropicMessagesRequestWithDefaults instantiates a new AnthropicMessagesRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *AnthropicMessagesRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *AnthropicMessagesRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *AnthropicMessagesRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetSystem

`func (o *AnthropicMessagesRequest) GetSystem() AnthropicMessagesRequestSystem`

GetSystem returns the System field if non-nil, zero value otherwise.

### GetSystemOk

`func (o *AnthropicMessagesRequest) GetSystemOk() (*AnthropicMessagesRequestSystem, bool)`

GetSystemOk returns a tuple with the System field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSystem

`func (o *AnthropicMessagesRequest) SetSystem(v AnthropicMessagesRequestSystem)`

SetSystem sets System field to given value.

### HasSystem

`func (o *AnthropicMessagesRequest) HasSystem() bool`

HasSystem returns a boolean if a field has been set.

### GetMessages

`func (o *AnthropicMessagesRequest) GetMessages() []AnthropicMessage`

GetMessages returns the Messages field if non-nil, zero value otherwise.

### GetMessagesOk

`func (o *AnthropicMessagesRequest) GetMessagesOk() (*[]AnthropicMessage, bool)`

GetMessagesOk returns a tuple with the Messages field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMessages

`func (o *AnthropicMessagesRequest) SetMessages(v []AnthropicMessage)`

SetMessages sets Messages field to given value.


### GetMaxTokens

`func (o *AnthropicMessagesRequest) GetMaxTokens() int32`

GetMaxTokens returns the MaxTokens field if non-nil, zero value otherwise.

### GetMaxTokensOk

`func (o *AnthropicMessagesRequest) GetMaxTokensOk() (*int32, bool)`

GetMaxTokensOk returns a tuple with the MaxTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMaxTokens

`func (o *AnthropicMessagesRequest) SetMaxTokens(v int32)`

SetMaxTokens sets MaxTokens field to given value.


### GetTemperature

`func (o *AnthropicMessagesRequest) GetTemperature() float32`

GetTemperature returns the Temperature field if non-nil, zero value otherwise.

### GetTemperatureOk

`func (o *AnthropicMessagesRequest) GetTemperatureOk() (*float32, bool)`

GetTemperatureOk returns a tuple with the Temperature field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTemperature

`func (o *AnthropicMessagesRequest) SetTemperature(v float32)`

SetTemperature sets Temperature field to given value.

### HasTemperature

`func (o *AnthropicMessagesRequest) HasTemperature() bool`

HasTemperature returns a boolean if a field has been set.

### GetTopP

`func (o *AnthropicMessagesRequest) GetTopP() float32`

GetTopP returns the TopP field if non-nil, zero value otherwise.

### GetTopPOk

`func (o *AnthropicMessagesRequest) GetTopPOk() (*float32, bool)`

GetTopPOk returns a tuple with the TopP field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopP

`func (o *AnthropicMessagesRequest) SetTopP(v float32)`

SetTopP sets TopP field to given value.

### HasTopP

`func (o *AnthropicMessagesRequest) HasTopP() bool`

HasTopP returns a boolean if a field has been set.

### GetTopK

`func (o *AnthropicMessagesRequest) GetTopK() int32`

GetTopK returns the TopK field if non-nil, zero value otherwise.

### GetTopKOk

`func (o *AnthropicMessagesRequest) GetTopKOk() (*int32, bool)`

GetTopKOk returns a tuple with the TopK field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopK

`func (o *AnthropicMessagesRequest) SetTopK(v int32)`

SetTopK sets TopK field to given value.

### HasTopK

`func (o *AnthropicMessagesRequest) HasTopK() bool`

HasTopK returns a boolean if a field has been set.

### GetTools

`func (o *AnthropicMessagesRequest) GetTools() []AnthropicTool`

GetTools returns the Tools field if non-nil, zero value otherwise.

### GetToolsOk

`func (o *AnthropicMessagesRequest) GetToolsOk() (*[]AnthropicTool, bool)`

GetToolsOk returns a tuple with the Tools field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTools

`func (o *AnthropicMessagesRequest) SetTools(v []AnthropicTool)`

SetTools sets Tools field to given value.

### HasTools

`func (o *AnthropicMessagesRequest) HasTools() bool`

HasTools returns a boolean if a field has been set.

### GetToolChoice

`func (o *AnthropicMessagesRequest) GetToolChoice() ChatCompletionsRequestToolChoice`

GetToolChoice returns the ToolChoice field if non-nil, zero value otherwise.

### GetToolChoiceOk

`func (o *AnthropicMessagesRequest) GetToolChoiceOk() (*ChatCompletionsRequestToolChoice, bool)`

GetToolChoiceOk returns a tuple with the ToolChoice field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolChoice

`func (o *AnthropicMessagesRequest) SetToolChoice(v ChatCompletionsRequestToolChoice)`

SetToolChoice sets ToolChoice field to given value.

### HasToolChoice

`func (o *AnthropicMessagesRequest) HasToolChoice() bool`

HasToolChoice returns a boolean if a field has been set.

### GetStream

`func (o *AnthropicMessagesRequest) GetStream() bool`

GetStream returns the Stream field if non-nil, zero value otherwise.

### GetStreamOk

`func (o *AnthropicMessagesRequest) GetStreamOk() (*bool, bool)`

GetStreamOk returns a tuple with the Stream field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStream

`func (o *AnthropicMessagesRequest) SetStream(v bool)`

SetStream sets Stream field to given value.

### HasStream

`func (o *AnthropicMessagesRequest) HasStream() bool`

HasStream returns a boolean if a field has been set.

### GetStopSequences

`func (o *AnthropicMessagesRequest) GetStopSequences() []string`

GetStopSequences returns the StopSequences field if non-nil, zero value otherwise.

### GetStopSequencesOk

`func (o *AnthropicMessagesRequest) GetStopSequencesOk() (*[]string, bool)`

GetStopSequencesOk returns a tuple with the StopSequences field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStopSequences

`func (o *AnthropicMessagesRequest) SetStopSequences(v []string)`

SetStopSequences sets StopSequences field to given value.

### HasStopSequences

`func (o *AnthropicMessagesRequest) HasStopSequences() bool`

HasStopSequences returns a boolean if a field has been set.

### GetModalities

`func (o *AnthropicMessagesRequest) GetModalities() []string`

GetModalities returns the Modalities field if non-nil, zero value otherwise.

### GetModalitiesOk

`func (o *AnthropicMessagesRequest) GetModalitiesOk() (*[]string, bool)`

GetModalitiesOk returns a tuple with the Modalities field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModalities

`func (o *AnthropicMessagesRequest) SetModalities(v []string)`

SetModalities sets Modalities field to given value.

### HasModalities

`func (o *AnthropicMessagesRequest) HasModalities() bool`

HasModalities returns a boolean if a field has been set.

### GetMetadata

`func (o *AnthropicMessagesRequest) GetMetadata() map[string]string`

GetMetadata returns the Metadata field if non-nil, zero value otherwise.

### GetMetadataOk

`func (o *AnthropicMessagesRequest) GetMetadataOk() (*map[string]string, bool)`

GetMetadataOk returns a tuple with the Metadata field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMetadata

`func (o *AnthropicMessagesRequest) SetMetadata(v map[string]string)`

SetMetadata sets Metadata field to given value.

### HasMetadata

`func (o *AnthropicMessagesRequest) HasMetadata() bool`

HasMetadata returns a boolean if a field has been set.

### GetMeta

`func (o *AnthropicMessagesRequest) GetMeta() bool`

GetMeta returns the Meta field if non-nil, zero value otherwise.

### GetMetaOk

`func (o *AnthropicMessagesRequest) GetMetaOk() (*bool, bool)`

GetMetaOk returns a tuple with the Meta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMeta

`func (o *AnthropicMessagesRequest) SetMeta(v bool)`

SetMeta sets Meta field to given value.

### HasMeta

`func (o *AnthropicMessagesRequest) HasMeta() bool`

HasMeta returns a boolean if a field has been set.

### GetDebug

`func (o *AnthropicMessagesRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *AnthropicMessagesRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *AnthropicMessagesRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *AnthropicMessagesRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetProvider

`func (o *AnthropicMessagesRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *AnthropicMessagesRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *AnthropicMessagesRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *AnthropicMessagesRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


