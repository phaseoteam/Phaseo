# AudioSpeechRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Input** | **string** |  | 
**Voice** | Pointer to **string** |  | [optional] 
**Format** | Pointer to **string** |  | [optional] 
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewAudioSpeechRequest

`func NewAudioSpeechRequest(model string, input string, ) *AudioSpeechRequest`

NewAudioSpeechRequest instantiates a new AudioSpeechRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAudioSpeechRequestWithDefaults

`func NewAudioSpeechRequestWithDefaults() *AudioSpeechRequest`

NewAudioSpeechRequestWithDefaults instantiates a new AudioSpeechRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *AudioSpeechRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *AudioSpeechRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *AudioSpeechRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetInput

`func (o *AudioSpeechRequest) GetInput() string`

GetInput returns the Input field if non-nil, zero value otherwise.

### GetInputOk

`func (o *AudioSpeechRequest) GetInputOk() (*string, bool)`

GetInputOk returns a tuple with the Input field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInput

`func (o *AudioSpeechRequest) SetInput(v string)`

SetInput sets Input field to given value.


### GetVoice

`func (o *AudioSpeechRequest) GetVoice() string`

GetVoice returns the Voice field if non-nil, zero value otherwise.

### GetVoiceOk

`func (o *AudioSpeechRequest) GetVoiceOk() (*string, bool)`

GetVoiceOk returns a tuple with the Voice field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetVoice

`func (o *AudioSpeechRequest) SetVoice(v string)`

SetVoice sets Voice field to given value.

### HasVoice

`func (o *AudioSpeechRequest) HasVoice() bool`

HasVoice returns a boolean if a field has been set.

### GetFormat

`func (o *AudioSpeechRequest) GetFormat() string`

GetFormat returns the Format field if non-nil, zero value otherwise.

### GetFormatOk

`func (o *AudioSpeechRequest) GetFormatOk() (*string, bool)`

GetFormatOk returns a tuple with the Format field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFormat

`func (o *AudioSpeechRequest) SetFormat(v string)`

SetFormat sets Format field to given value.

### HasFormat

`func (o *AudioSpeechRequest) HasFormat() bool`

HasFormat returns a boolean if a field has been set.

### GetDebug

`func (o *AudioSpeechRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *AudioSpeechRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *AudioSpeechRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *AudioSpeechRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetProvider

`func (o *AudioSpeechRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *AudioSpeechRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *AudioSpeechRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *AudioSpeechRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


