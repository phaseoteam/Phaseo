# MusicGenerateRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Prompt** | Pointer to **string** |  | [optional] 
**Duration** | Pointer to **int32** |  | [optional] 
**Format** | Pointer to **string** |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 
**Suno** | Pointer to [**MusicGenerateRequestSuno**](MusicGenerateRequestSuno.md) |  | [optional] 
**Elevenlabs** | Pointer to [**MusicGenerateRequestElevenlabs**](MusicGenerateRequestElevenlabs.md) |  | [optional] 
**EchoUpstreamRequest** | Pointer to **bool** |  | [optional] 
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 

## Methods

### NewMusicGenerateRequest

`func NewMusicGenerateRequest(model string, ) *MusicGenerateRequest`

NewMusicGenerateRequest instantiates a new MusicGenerateRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewMusicGenerateRequestWithDefaults

`func NewMusicGenerateRequestWithDefaults() *MusicGenerateRequest`

NewMusicGenerateRequestWithDefaults instantiates a new MusicGenerateRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *MusicGenerateRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *MusicGenerateRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *MusicGenerateRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetPrompt

`func (o *MusicGenerateRequest) GetPrompt() string`

GetPrompt returns the Prompt field if non-nil, zero value otherwise.

### GetPromptOk

`func (o *MusicGenerateRequest) GetPromptOk() (*string, bool)`

GetPromptOk returns a tuple with the Prompt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrompt

`func (o *MusicGenerateRequest) SetPrompt(v string)`

SetPrompt sets Prompt field to given value.

### HasPrompt

`func (o *MusicGenerateRequest) HasPrompt() bool`

HasPrompt returns a boolean if a field has been set.

### GetDuration

`func (o *MusicGenerateRequest) GetDuration() int32`

GetDuration returns the Duration field if non-nil, zero value otherwise.

### GetDurationOk

`func (o *MusicGenerateRequest) GetDurationOk() (*int32, bool)`

GetDurationOk returns a tuple with the Duration field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDuration

`func (o *MusicGenerateRequest) SetDuration(v int32)`

SetDuration sets Duration field to given value.

### HasDuration

`func (o *MusicGenerateRequest) HasDuration() bool`

HasDuration returns a boolean if a field has been set.

### GetFormat

`func (o *MusicGenerateRequest) GetFormat() string`

GetFormat returns the Format field if non-nil, zero value otherwise.

### GetFormatOk

`func (o *MusicGenerateRequest) GetFormatOk() (*string, bool)`

GetFormatOk returns a tuple with the Format field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFormat

`func (o *MusicGenerateRequest) SetFormat(v string)`

SetFormat sets Format field to given value.

### HasFormat

`func (o *MusicGenerateRequest) HasFormat() bool`

HasFormat returns a boolean if a field has been set.

### GetProvider

`func (o *MusicGenerateRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *MusicGenerateRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *MusicGenerateRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *MusicGenerateRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.

### GetSuno

`func (o *MusicGenerateRequest) GetSuno() MusicGenerateRequestSuno`

GetSuno returns the Suno field if non-nil, zero value otherwise.

### GetSunoOk

`func (o *MusicGenerateRequest) GetSunoOk() (*MusicGenerateRequestSuno, bool)`

GetSunoOk returns a tuple with the Suno field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSuno

`func (o *MusicGenerateRequest) SetSuno(v MusicGenerateRequestSuno)`

SetSuno sets Suno field to given value.

### HasSuno

`func (o *MusicGenerateRequest) HasSuno() bool`

HasSuno returns a boolean if a field has been set.

### GetElevenlabs

`func (o *MusicGenerateRequest) GetElevenlabs() MusicGenerateRequestElevenlabs`

GetElevenlabs returns the Elevenlabs field if non-nil, zero value otherwise.

### GetElevenlabsOk

`func (o *MusicGenerateRequest) GetElevenlabsOk() (*MusicGenerateRequestElevenlabs, bool)`

GetElevenlabsOk returns a tuple with the Elevenlabs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetElevenlabs

`func (o *MusicGenerateRequest) SetElevenlabs(v MusicGenerateRequestElevenlabs)`

SetElevenlabs sets Elevenlabs field to given value.

### HasElevenlabs

`func (o *MusicGenerateRequest) HasElevenlabs() bool`

HasElevenlabs returns a boolean if a field has been set.

### GetEchoUpstreamRequest

`func (o *MusicGenerateRequest) GetEchoUpstreamRequest() bool`

GetEchoUpstreamRequest returns the EchoUpstreamRequest field if non-nil, zero value otherwise.

### GetEchoUpstreamRequestOk

`func (o *MusicGenerateRequest) GetEchoUpstreamRequestOk() (*bool, bool)`

GetEchoUpstreamRequestOk returns a tuple with the EchoUpstreamRequest field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEchoUpstreamRequest

`func (o *MusicGenerateRequest) SetEchoUpstreamRequest(v bool)`

SetEchoUpstreamRequest sets EchoUpstreamRequest field to given value.

### HasEchoUpstreamRequest

`func (o *MusicGenerateRequest) HasEchoUpstreamRequest() bool`

HasEchoUpstreamRequest returns a boolean if a field has been set.

### GetDebug

`func (o *MusicGenerateRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *MusicGenerateRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *MusicGenerateRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *MusicGenerateRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


